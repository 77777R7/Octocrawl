#!/bin/bash
# H2b on Cloud Run, from Howard's Mac (gcloud needs HTTPS_PROXY here; every call names the project). Steps:
#   build <branch>           the G4 image (research/access/g4-cloudrun/Dockerfile and build.sh) from that branch's commit;
#                            the build's source archive is noted in .w2l/access/h2b/build-sources.txt for cleanup
#   secrets                  one temporary secret, octocrawl-h2b-res-a: RESIDENTIAL_PROXY from competitors.env, piped to
#                            gcloud's stdin and never printed, readable by the jobs' service account alone
#   jobs <image@digest>      the three jobs: google and res-a at 2 vCPU / 4 GiB gen2, and res-a at 4 vCPU / 8 GiB
#   robots <window>          the window's robots.txt verdict, from Cloud Run's own egress (round.sh arm "robots")
#   window <n> [<skip>]      every round of window n at once (res-a-4cpu in window 1 only); <skip> is the verdict's
#                            disallowed tasks joined by "+", left out of the residential rounds
#   logs <execution> <file>  an execution's log lines, as JSON lines, into a file
#   cleanup <image>          delete the jobs, the secret, every image of this run and the noted build sources
set -euo pipefail
export HTTPS_PROXY=${HTTPS_PROXY:-http://127.0.0.1:7890}
P=octopus-w2l-20260924-7r7
R=asia-southeast1
SA=307354954747-compute@developer.gserviceaccount.com
COMPETITORS=$HOME/Code/w2l/.w2l/access/competitors.env
GRANT=$HOME/Code/w2l/.w2l/access/installed-chrome-grant.json
NOTES=$HOME/Code/w2l/.w2l/access/h2b
# job  arm  session style  secret  cpu  memory  offset (where its task list starts)
JOBS="google:google:direct:-:2:4Gi:0
res-a:res_a:webshare:res-a:2:4Gi:7
res-a-4cpu:res_a:webshare:res-a:4:8Gi:14"

case ${1:-} in
  build)
    mkdir -p "$NOTES"
    status=0
    bash research/access/g4-cloudrun/build.sh "${2:?branch}" "$R-docker.pkg.dev/$P/w2l-public-preview/octocrawl-h2b-20261027" 2>&1 | tee "$NOTES/build-$(date -u +%Y%m%dT%H%M%SZ).log" || status=$?
    # Noted even when the build failed: the source archive is uploaded before the build starts.
    { grep -ho 'gs://[^]]*\.tgz' "$NOTES"/build-*.log || true; } | sort -u >"$NOTES/build-sources.txt"
    echo "build sources noted: $(wc -l <"$NOTES/build-sources.txt")"
    exit "$status" ;;
  secrets)
    # The value goes from the file to gcloud's stdin: never an argument, a printed variable or a log line.
    read_login() { node -e 'const line = require("fs").readFileSync(process.argv[1], "utf8").split("\n").find((l) => l.startsWith("RESIDENTIAL_PROXY=")); if (line === undefined) process.exit(3); process.stdout.write(line.slice(18).trim().replace(/^["\x27]|["\x27]$/g, ""))' "$COMPETITORS"; }
    read_login >/dev/null || { echo "RESIDENTIAL_PROXY is missing from $COMPETITORS" >&2; exit 3; }
    read_login | gcloud secrets create octocrawl-h2b-res-a --project="$P" --replication-policy=automatic --labels=purpose=h2b-temp --data-file=-
    gcloud secrets add-iam-policy-binding octocrawl-h2b-res-a --project="$P" --member="serviceAccount:$SA" --role=roles/secretmanager.secretAccessor --format='value(etag)' >/dev/null
    echo "secret octocrawl-h2b-res-a: created, readable by $SA" ;;
  jobs)
    image=${2:?image@sha256:digest}
    grant=$(base64 <"$GRANT" | tr -d '\n')
    while IFS=: read -r job arm style secret cpu mem _; do
      args=(--project="$P" --region="$R" --image="$image" --execution-environment=gen2 --cpu="$cpu" --memory="$mem" --tasks=1 --max-retries=0
        --task-timeout=3600s --service-account="$SA" --labels=purpose=h2b-temp --command=/usr/bin/tini --args=-g,--,bash,research/access/h2b-egress/round.sh
        --set-env-vars="H2B_ARM=$arm,H2B_SESSION_STYLE=$style,G4_GRANT_B64=$grant")
      [ "$secret" != - ] && args+=(--set-secrets="H2B_UPSTREAMS=octocrawl-h2b-$secret:1")
      gcloud run jobs create "octocrawl-h2b-$job" "${args[@]}" --format='value(metadata.name)'
    done <<<"$JOBS" ;;
  robots)
    gcloud run jobs execute octocrawl-h2b-google --project="$P" --region="$R" --wait --update-env-vars="H2B_ARM=robots,H2B_WINDOW=${2:?window}" --format='value(metadata.name)' ;;
  window)
    w=${2:?window}; skip=${3:-}; reverse=0; [ "$w" = 2 ] && reverse=1
    while IFS=: read -r job arm style secret cpu mem offset; do
      [ "$job" = res-a-4cpu ] && [ "$w" != 1 ] && continue
      vars="H2B_WINDOW=$w,H2B_OFFSET=$offset,H2B_REVERSE=$reverse"
      # The google round sends every task; the residential rounds leave out the window's robots.txt refusals.
      [ "$arm" != google ] && [ -n "$skip" ] && vars="$vars,H2B_SKIP=$skip"
      gcloud run jobs execute "octocrawl-h2b-$job" --project="$P" --region="$R" --async --update-env-vars="$vars" --format='value(metadata.name)'
    done <<<"$JOBS" ;;
  logs)
    gcloud logging read "resource.type=\"cloud_run_job\" AND labels.\"run.googleapis.com/execution_name\"=\"${2:?execution}\"" \
      --project="$P" --limit=20000 --order=asc --format=json \
      | node -e 'let s="";process.stdin.on("data",(d)=>s+=d).on("end",()=>{for (const e of JSON.parse(s)) console.log(e.jsonPayload !== undefined ? JSON.stringify({ ...e.jsonPayload, _at: e.timestamp }) : JSON.stringify({ text: e.textPayload ?? null, _at: e.timestamp }))})' >"${3:?file}"
    wc -l <"$3" ;;
  cleanup)
    image=${2:?image without digest}
    while IFS=: read -r job _; do gcloud run jobs delete "octocrawl-h2b-$job" --project="$P" --region="$R" --quiet || true; done <<<"$JOBS"
    gcloud secrets delete octocrawl-h2b-res-a --project="$P" --quiet || true
    for digest in $(gcloud artifacts docker images list "$image" --project="$P" --format='value(version)'); do
      gcloud artifacts docker images delete "$image@$digest" --project="$P" --delete-tags --quiet || true
    done
    [ -s "$NOTES/build-sources.txt" ] && xargs gcloud storage rm --project="$P" <"$NOTES/build-sources.txt" || true ;;
  *) echo "usage: cloud.sh build|secrets|jobs|robots|window|logs|cleanup …" >&2; exit 2 ;;
esac
