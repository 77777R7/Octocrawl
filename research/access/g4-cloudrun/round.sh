#!/bin/bash
# One G4 round (research/access/runs/2026-10-21-g4-cloudrun-fixed-runtime-ab2d9bad.md): the same steps on Cloud Run (the
# image's CMD) and on the Mac (local.sh), with the exit the arm names. Every line it prints is JSON or a log line:
#   marks    {"mark": <step>, "ms": <since start>}: container/process start, Xvfb, forwarder, self-check, API, run.
#   controls selfcheck.mjs (display, grant, DNS, fonts, Chrome, CDP, the egress control page in that Chrome), then the
#            API's own control (POST /v1/scrape of the echo page, no access option); run-set's echo is the third.
#            A failed control marks the round; the 16 tasks still run and stay in the denominator.
#   tasks    phases.mjs: one line per task and one for the run.
# Environment: G4_WHERE (cloud|local), G4_ARM (direct|webshare); G4_GRANT_B64 (the grant file's bytes, base64) or
# W2L_ACCESS_GRANT (its path); UPSTREAM_PROXY, the proxy forward.mjs sends everything to (absent: no proxy at all);
# API_PORT (8787), FORWARD_PORT (8796). UPSTREAM_PROXY carries a login: it goes to the forwarder alone, is unset before
# anything else starts, and is never printed.
set -u
cd "$(dirname "$0")/../../.."
now() { node -e 'process.stdout.write(String(Date.now()))'; }
t0=$(now)
mark() { echo "{\"mark\":\"$1\",\"ms\":$(( $(now) - t0 )),\"where\":\"${G4_WHERE:-}\",\"arm\":\"${G4_ARM:-}\"}"; }
pids=()
finish() {
  for pid in "${pids[@]:-}"; do [ -n "$pid" ] && kill -TERM "$pid" 2>/dev/null; done
  wait 2>/dev/null
}
# Cloud Run sends SIGTERM and kills about ten seconds later: stop the API, forwarder and Xvfb at once (tini -g has
# already passed the signal to the whole group; Chrome's own exit hook removes its profile).
trap 'mark sigterm; finish; exit 143' TERM INT
api_port=${API_PORT:-8787}; forward_port=${FORWARD_PORT:-8796}
mark start

if [ -n "${G4_GRANT_B64:-}" ]; then
  printf '%s' "$G4_GRANT_B64" | base64 -d > /tmp/g4-grant.json
  export W2L_ACCESS_GRANT=/tmp/g4-grant.json
  unset G4_GRANT_B64
fi

if [ "${G4_WHERE:-}" = cloud ]; then
  node -e 'const t=require("fs").readFileSync("/app/.g4-image-manifest.txt","utf8").split("\n");const want=/^(xvfb|tini|fonts-liberation|fonts-noto-cjk|google-chrome-stable|libc6|libnss3|fontconfig) /;console.log(JSON.stringify({image:{chrome:t[0],node:t[1],playwright:t[2],packages:t.filter((l)=>want.test(l))}}))'
  Xvfb :99 -screen 0 1920x1080x24 -nolisten tcp >/tmp/xvfb.log 2>&1 &
  pids+=($!)
  export DISPLAY=:99
  for _ in $(seq 1 100); do [ -S /tmp/.X11-unix/X99 ] && break; sleep 0.1; done
  mark xvfb_ready
fi

if [ -n "${UPSTREAM_PROXY:-}" ]; then
  export G4_GATEWAY_HOST
  G4_GATEWAY_HOST=$(node -e 'process.stdout.write(new URL(process.env.UPSTREAM_PROXY).hostname)')
  FORWARD_PORT=$forward_port node research/access/cloudrun-xvfb/forward.mjs &
  pids+=($!)
  unset UPSTREAM_PROXY
  for _ in $(seq 1 40); do (echo > "/dev/tcp/127.0.0.1/$forward_port") 2>/dev/null && break; sleep 0.25; done
  export HTTPS_PROXY=http://127.0.0.1:$forward_port HTTP_PROXY=http://127.0.0.1:$forward_port NO_PROXY=localhost,127.0.0.1,::1
  mark forwarder_ready
else
  unset HTTPS_PROXY HTTP_PROXY https_proxy http_proxy NO_PROXY no_proxy
fi

node --import tsx research/access/g4-cloudrun/selfcheck.mjs &
pids+=($!); wait $!
mark selfcheck_done

node --import tsx packages/api/src/cli.ts --port "$api_port" >/tmp/g4-api-$api_port.log 2>&1 &
pids+=($!)
for _ in $(seq 1 240); do grep -q listening "/tmp/g4-api-$api_port.log" 2>/dev/null && break; sleep 0.5; done
grep -E "grant|listening" "/tmp/g4-api-$api_port.log"
mark api_listening

curl -s -m 90 -X POST "http://127.0.0.1:$api_port/v1/scrape" -H 'content-type: application/json' \
  -d '{"url":"https://api.ipify.org/?format=json","formats":["markdown"],"maxAge":0,"storeInCache":false}' \
  | node -e 'let s="";process.stdin.on("data",(d)=>s+=d).on("end",()=>{let r={};try{const j=JSON.parse(s);const d=j.data??j;r={status:d.status??null,lane:d.lane??null,ip:(d.markdown??d.document?.markdown??JSON.stringify(d)).match(/\b\d{1,3}(?:\.\d{1,3}){3}\b/)?.[0]??null}}catch{r={error:s.slice(0,200)}};r.ok=r.ip!=null;console.log(JSON.stringify({apiControl:r}))})'
mark api_control_done

W2L_API_URL=http://127.0.0.1:$api_port W2L_EGRESS_ECHO_URL=https://api.ipify.org node research/access/run-set.mjs --set all \
  --only "$(node -e "process.stdout.write(require('./research/access/subsets.v1.json').subsets.challenge16.tasks.join(','))")" \
  --access '"enhanced"' --save-responses &
pids+=($!); wait $!
mark run_done

node research/access/g4-cloudrun/phases.mjs
echo "api log tail:"; tail -5 "/tmp/g4-api-$api_port.log"
finish
mark end
