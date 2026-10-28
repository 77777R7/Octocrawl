#!/bin/bash
# One H2b round on Cloud Run: one arm, one window (research/access/runs/2026-10-27-h2b-egress-8ece08ab.md). The job runs it
# with tini as PID 1, on the G4 image rebuilt from the commit measured. Every line it prints is JSON or a log line:
#   marks     {"mark": <step>, "ms": <since start>}
#   robots    arm "robots" only: the window's robots.txt verdict (robots.mjs), then the round ends.
#   forwarder the metering forwarder's start line (forward.mjs): its style and the gateway's host name only.
#   controls  selfcheck.mjs through the arm's exit (the installed Chrome loads the echo page), then the API's own control
#             (POST /v1/scrape of the echo page: the exit of the http rung, this instance's own egress).
#   calls     per task: the forwarder's call line, then digest.mjs's {"task": …} with the verdict, phases, challenge
#             wait and its cap, bytes through the exit, the exit address at the call's start and end, and CPU.
# One run-set call per task, so each call gets its own exit. The API runs with no environment proxy: its http,
# compatible-transport and bundled-browser rungs leave from this instance's egress; only the installed Chrome goes
# through the forwarder (W2L_CHROME_PATH=chrome.sh), as the hosted plan's Chrome service would.
# Environment: H2B_ARM (google|res_a|dc|robots), H2B_WINDOW, H2B_SESSION_STYLE (direct|webshare|list, forward.mjs),
# H2B_UPSTREAMS (the Webshare gateway URL with its login, or the datacenter proxy list, from Secret Manager; absent for
# google), H2B_LIST_START (dc: the shuffled list's position of the round's first call), H2B_OFFSET (where in the task
# list this round starts), H2B_REVERSE (1: the list backwards), H2B_SKIP (tasks not sent: the paid rounds' robots.txt
# refusals for the window, joined by "+"), H2B_TASKS (default below), G4_GRANT_B64 (the installed_chrome grant's
# bytes, base64).
# H2B_UPSTREAMS moves into an unexported shell variable at once, so no process but the forwarder gets it; never printed.
set -u
upstreams=${H2B_UPSTREAMS:-}
unset H2B_UPSTREAMS
cd "$(dirname "$0")/../../.."
now() { node -e 'process.stdout.write(String(Date.now()))'; }
t0=$(now)
arm=${H2B_ARM:?google, res_a or robots}
mark() { echo "{\"mark\":\"$1\",\"ms\":$(( $(now) - t0 )),\"arm\":\"$arm\",\"window\":\"${H2B_WINDOW:-}\"}"; }
pids=()
finish() {
  for pid in "${pids[@]:-}"; do [ -n "$pid" ] && kill -TERM "$pid" 2>/dev/null; done
  wait 2>/dev/null
}
# Cloud Run sends SIGTERM and kills about ten seconds later: stop the API, the forwarder and Xvfb at once (tini -g has
# already passed the signal to the whole group; Chrome's own exit hook removes its profile).
trap 'mark sigterm; finish; exit 143' TERM INT
api_port=8787; forward_port=8796; control=/tmp/h2b-forward.sock
# challenge16 (research/access/subsets.v1.json) and the five tasks hosted lost to local on 2026-10-27, robots.txt apart.
export H2B_TASKS=${H2B_TASKS:-$(node -e "process.stdout.write([...require('./research/access/subsets.v1.json').subsets.challenge16.tasks, 'T051', 'T072', 'T006', 'T007', 'T011'].join(','))")}
unset HTTPS_PROXY HTTP_PROXY https_proxy http_proxy NO_PROXY no_proxy ALL_PROXY all_proxy
mark start

if [ "$arm" = robots ]; then
  node --import tsx research/access/h2b-egress/robots.mjs
  mark end
  exit 0
fi

if [ -n "${G4_GRANT_B64:-}" ]; then
  printf '%s' "$G4_GRANT_B64" | base64 -d > /tmp/h2b-grant.json
  export W2L_ACCESS_GRANT=/tmp/h2b-grant.json
  unset G4_GRANT_B64
fi

node -e 'const t=require("fs").readFileSync("/app/.g4-image-manifest.txt","utf8").split("\n");const want=/^(xvfb|tini|fonts-liberation|fonts-noto-cjk|google-chrome-stable|libc6|libnss3|fontconfig) /;console.log(JSON.stringify({image:{chrome:t[0],node:t[1],playwright:t[2],packages:t.filter((l)=>want.test(l))}}))'
Xvfb :99 -screen 0 1920x1080x24 -nolisten tcp >/tmp/xvfb.log 2>&1 &
pids+=($!)
export DISPLAY=:99
for _ in $(seq 1 100); do [ -S /tmp/.X11-unix/X99 ] && break; sleep 0.1; done
mark xvfb_ready

H2B_UPSTREAMS=$upstreams FORWARD_PORT=$forward_port H2B_CONTROL=$control node research/access/h2b-egress/forward.mjs >/tmp/h2b-forward.log 2>&1 &
pids+=($!)
unset upstreams
for _ in $(seq 1 60); do [ -S "$control" ] && grep -q '"forwarder"' /tmp/h2b-forward.log 2>/dev/null && break; sleep 0.25; done
cat /tmp/h2b-forward.log
# Without the forwarder every Chrome call would fail on its proxy: the round stops here, marked, instead.
if ! grep -q '"forwarder"' /tmp/h2b-forward.log 2>/dev/null; then mark forwarder_failed; finish; exit 1; fi
H2B_GATEWAY_HOSTS=$(node -e 'try{const l=require("fs").readFileSync("/tmp/h2b-forward.log","utf8").split("\n").find((x)=>x.includes("\"forwarder\""));process.stdout.write(JSON.parse(l).forwarder.hosts.map((h)=>h.replace(/:\d+$/,"")).join(","))}catch{}')
export H2B_GATEWAY_HOSTS
export W2L_CHROME_PATH=$PWD/research/access/h2b-egress/chrome.sh H2B_CHROME_PROXY=http://127.0.0.1:$forward_port H2B_CHROME_LOG=/tmp/h2b-chrome.log
mark forwarder_ready
# /end can wait for both echoes (30 s connect and 20 s answer each), so the client waits longer than that.
ctl() { curl -s -m 150 --unix-socket "$control" -X "$1" "http://h2b$2"; echo; }

ctl POST "/call?task=selfcheck&n=0"
node --import tsx research/access/h2b-egress/selfcheck.mjs &
pids+=($!); wait $!
ctl POST /end
mark selfcheck_done

node --import tsx packages/api/src/cli.ts --port "$api_port" >/tmp/h2b-api.log 2>&1 &
pids+=($!)
for _ in $(seq 1 240); do grep -q listening /tmp/h2b-api.log 2>/dev/null && break; sleep 0.5; done
grep -E "grant|listening" /tmp/h2b-api.log
mark api_listening

curl -s -m 90 -X POST "http://127.0.0.1:$api_port/v1/scrape" -H 'content-type: application/json' \
  -d '{"url":"https://api.ipify.org/?format=json","formats":["markdown"],"maxAge":0,"storeInCache":false}' \
  | node -e 'let s="";process.stdin.on("data",(d)=>s+=d).on("end",()=>{let r={};try{const j=JSON.parse(s);const d=j.data??j;r={status:d.status??null,lane:d.lane??null,ip:(d.markdown??d.document?.markdown??JSON.stringify(d)).match(/\b\d{1,3}(?:\.\d{1,3}){3}\b/)?.[0]??null}}catch{r={error:s.slice(0,200)}};r.ok=r.ip!=null;console.log(JSON.stringify({apiControl:r}))})'
mark api_control_done

order=$(node -e '
  let ids = process.env.H2B_TASKS.split(",").filter(Boolean)
  if (process.env.H2B_REVERSE === "1") ids = ids.reverse()
  const k = Number(process.env.H2B_OFFSET ?? 0) % ids.length
  process.stdout.write([...ids.slice(k), ...ids.slice(0, k)].join(" "))')
echo "{\"order\":\"$order\",\"skip\":\"${H2B_SKIP:-}\"}"
# cloud.sh joins the skipped tasks with "+" (gcloud splits env values on commas).
skip=",${H2B_SKIP:-},"; skip=${skip//+/,}
n=0
for t in $order; do
  n=$((n + 1))
  if [[ "$skip" == *",$t,"* ]]; then
    echo "{\"task\":{\"id\":\"$t\",\"n\":$n,\"skipped\":\"robots\",\"verified\":false}}"
    continue
  fi
  ctl POST "/call?task=$t&n=$n"
  node research/access/h2b-egress/cpu.mjs >"/tmp/h2b-cpu-$t.json" 2>/dev/null &
  cpu=$!
  before=$(ls -td .w2l/access/runs/*/ 2>/dev/null | head -1)
  W2L_API_URL=http://127.0.0.1:$api_port W2L_EGRESS_ECHO_URL=https://api.ipify.org node research/access/run-set.mjs \
    --set all --only "$t" --access '"enhanced"' --save-responses >"/tmp/h2b-runset-$t.log" 2>&1 &
  rs=$!
  pids+=($rs); wait $rs; code=$?
  kill -TERM "$cpu" 2>/dev/null; wait "$cpu" 2>/dev/null
  ctl POST /end >"/tmp/h2b-end-$t.json"
  dir=$(ls -td .w2l/access/runs/*/ 2>/dev/null | head -1)
  [ "$dir" = "$before" ] && dir=""
  [ "$code" != 0 ] && echo "{\"runSetFailed\":{\"task\":\"$t\",\"code\":$code}}" && tail -3 "/tmp/h2b-runset-$t.log"
  node research/access/h2b-egress/digest.mjs "$dir" "$t" "/tmp/h2b-cpu-$t.json" <"/tmp/h2b-end-$t.json"
done
mark run_done

# Every call's final counters, a tunnel that outlived its call's end included.
ctl GET /calls
echo "{\"chromeLaunches\":$(wc -l </tmp/h2b-chrome.log 2>/dev/null || echo null)}"
echo "api log tail:"; tail -5 /tmp/h2b-api.log
finish
mark end
