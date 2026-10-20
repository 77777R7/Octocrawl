#!/bin/bash
# One measurement of installed_chrome on Cloud Run (Dockerfile beside this file): Xvfb, the local API with the grant in
# W2L_ACCESS_GRANT, the 16 challenge tasks once, then each task's outcome as a JSON line on stdout (Cloud Logging reads
# those as jsonPayload).
set -u
Xvfb :99 -screen 0 1920x1080x24 -nolisten tcp >/tmp/xvfb.log 2>&1 &
export DISPLAY=:99
cd /app
echo "chrome: $(google-chrome --version)"
# With UPSTREAM_PROXY (a proxy with a login, from Secret Manager), every lane leaves through it via forward.mjs.
if [ -n "${UPSTREAM_PROXY:-}" ]; then
  node research/access/cloudrun-xvfb/forward.mjs &
  for _ in $(seq 1 20); do (echo > /dev/tcp/127.0.0.1/8794) 2>/dev/null && break; sleep 0.5; done
  export HTTPS_PROXY=http://127.0.0.1:8794 HTTP_PROXY=http://127.0.0.1:8794 NO_PROXY=localhost,127.0.0.1,::1
fi
node --import tsx packages/api/src/cli.ts --port 8787 >/tmp/api.log 2>&1 &
for _ in $(seq 1 120); do grep -q listening /tmp/api.log 2>/dev/null && break; sleep 1; done
grep -E "grant|listening" /tmp/api.log
# The 16 tasks are the challenge16 subset of research/access/subsets.v1.json.
W2L_API_URL=http://127.0.0.1:8787 W2L_EGRESS_ECHO_URL=https://api.ipify.org node research/access/run-set.mjs --set all \
  --only "$(node -e "process.stdout.write(require('./research/access/subsets.v1.json').subsets.challenge16.tasks.join(','))")" --access '"enhanced"' --save-responses
node research/access/cloudrun-xvfb/summarize.mjs
echo "api log tail:"; tail -20 /tmp/api.log
