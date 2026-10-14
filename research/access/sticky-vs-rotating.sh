#!/bin/zsh
# installed_chrome through the Webshare residential gateway, one session mode per round: `rotate` (the gateway gives
# each connection a new exit) or `sticky` (each task gets a new numeric session id, one exit for all its connections).
# One run-set call per task, so each task can have its own session; a local API on 8797, research/access/cloudrun-xvfb/
# forward.mjs on 8796 adding the gateway's login. The gateway URL (user-us-rotate:pass@p.webshare.io) is read from
# RESIDENTIAL_PROXY in .w2l/access/competitors.env, the grant from .w2l/access/installed-chrome-grant.json.
# Usage: TASKS="T001 T002" research/access/sticky-vs-rotating.sh <label> <rotate|sticky>
# 2026-10-14: research/access/runs/2026-10-14-installed-chrome-sticky-vs-rotating-aad87f9f.md.
set -u
label=$1; mode=$2
cd "$(git rev-parse --show-toplevel)"
env_file=${COMPETITORS_ENV:-.w2l/access/competitors.env}
BASE=$(node -e "const l=require('fs').readFileSync(process.argv[1],'utf8').split('\n').find(x=>x.trim().startsWith('RESIDENTIAL_PROXY='));process.stdout.write(l.split('=').slice(1).join('=').trim().replace(/^['\"]|['\"]\$/g,''))" "$env_file")
logs=.w2l/access/sticky; mkdir -p $logs
out=$logs/$label.log; : > $out
echo "== $label $mode start $(date -u +%FT%TZ)" | tee -a $out
(HTTPS_PROXY=http://127.0.0.1:8796 HTTP_PROXY=http://127.0.0.1:8796 W2L_ACCESS_GRANT=.w2l/access/installed-chrome-grant.json node --import tsx packages/api/src/cli.ts --port 8797 > $logs/api-$label.log 2>&1 &)
for _ in $(seq 1 90); do grep -q listening $logs/api-$label.log 2>/dev/null && break; sleep 2; done
for t in ${=TASKS:-T001 T002 T005 T034 T038 T045 T046 T047 T048 T049 T053 T068 T071 T076 B001 B008}; do
  # zsh's $RANDOM repeats inside $(...): the session id comes from node.
  sid=$([ $mode = sticky ] && node -e "console.log(1 + Math.floor(Math.random() * 999999999))" || echo rotate)
  UP=$(node -e "const u=new URL(process.argv[1]);u.username=encodeURIComponent(decodeURIComponent(u.username).replace(/-rotate\$/,'-'+process.argv[2]));process.stdout.write(u.href)" "$BASE" $sid)
  (UPSTREAM_PROXY=$UP FORWARD_PORT=8796 node research/access/cloudrun-xvfb/forward.mjs >/dev/null 2>&1 &)
  for _ in $(seq 1 20); do lsof -nP -iTCP:8796 -sTCP:LISTEN >/dev/null 2>&1 && break; sleep 0.3; done
  HTTPS_PROXY=http://127.0.0.1:8796 HTTP_PROXY=http://127.0.0.1:8796 NO_PROXY=localhost,127.0.0.1,::1 W2L_API_URL=http://127.0.0.1:8797 W2L_EGRESS_ECHO_URL=https://api.ipify.org \
    node research/access/run-set.mjs --set all --only $t --access '"enhanced"' --save-responses > $logs/$label-$t.log 2>&1
  dir=$(ls -td .w2l/access/runs/*/ | head -1)
  ip=$(node -e "console.log(require('./$dir/summary.json').environment.exitIp)")
  echo "$t sid=$sid $(grep -E "^$t cold" $logs/$label-$t.log | cut -c1-80) | exit $ip | dir $dir" | tee -a $out
  p=$(lsof -nP -iTCP:8796 -sTCP:LISTEN -t); [ -n "$p" ] && kill $p; sleep 1
done
p=$(lsof -nP -iTCP:8797 -sTCP:LISTEN -t); [ -n "$p" ] && kill $p
echo "== $label done $(date -u +%FT%TZ) verified $(grep -c ' cold verified' $out)" | tee -a $out
