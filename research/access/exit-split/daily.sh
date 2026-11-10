#!/bin/bash
# M4.2 daily driver (docs/enhanced-access-tasks.md): one day's session of the multi-day rerun of M1, with the two
# Chrome for Testing arms of M3 alongside. It starts the forwarder and the local API itself and stops them at the end.
#   A  installed Chrome, the exit the API gives it (the same-day baseline; also M3.3's daily baseline)
#   B  installed Chrome, one datacenter proxy per launch (forward.mjs); the launch counter carries over between days
#   C  Chrome for Testing ($EXIT_SPLIT_CFT), same exit as A
#   N  the same binary with --disable-field-trial-config (chrome-noftc.sh), same exit as A
# Two rounds a day, A B C N in each, the 16 challenge16 tasks per run. One session per UTC day: a second one is refused.
# Run from the repository root, with the shell's proxy variables as the API should see them.
state=${EXIT_SPLIT_STATE:?the state directory, kept across days}
grant=${EXIT_SPLIT_GRANT:?the installed_chrome grant file}
proxies=${EXIT_SPLIT_PROXIES:?the datacenter proxy list}
cft=${EXIT_SPLIT_CFT:?the Chrome for Testing binary}
installed=${EXIT_SPLIT_REAL_CHROME:-/Applications/Google Chrome.app/Contents/MacOS/Google Chrome}
port=${W2L_API_PORT:-8787}
day=$(date -u +%Y-%m-%d)
dir="$state/day-$day"
[ -e "$dir" ] && { echo "daily.sh: $dir exists, this UTC day already has a session" >&2; exit 2; }
if lsof -nP -iTCP:"$port" -iTCP:18900 -sTCP:LISTEN >/dev/null 2>&1; then echo "daily.sh: port $port or 18900 is in use" >&2; exit 2; fi
mkdir -p "$dir" || exit 2
npx tsc --build || { echo "daily.sh: the build failed" >&2; exit 2; }
{ echo "installed: $("$installed" --version)"; echo "cft: $("$cft" --version)"; echo "commit: $(git rev-parse --short HEAD)"; } > "$dir/versions.txt"

EXIT_SPLIT_LOG="$dir/forward.jsonl" node research/access/exit-split/forward.mjs > "$dir/forward.out" 2>&1 &
forward=$!
echo A > "$state/arm"; rm -f "$state/chrome"
W2L_ACCESS_GRANT="$grant" W2L_CHROME_PATH="$PWD/research/access/exit-split/chrome.sh" EXIT_SPLIT_SIZE=$(grep -c . "$proxies") \
  node --import tsx packages/api/src/cli.ts > "$dir/api.out" 2>&1 &
api=$!
trap 'kill $api $forward 2>/dev/null; rm -f "$state/chrome"; echo A > "$state/arm"' EXIT
for _ in $(seq 60); do grep -q "listening on" "$dir/api.out" && break; sleep 1; done
grep -q "listening on" "$dir/api.out" || { echo "daily.sh: the API did not start" >&2; exit 2; }

ids=$(node -e "console.log(JSON.parse(require('fs').readFileSync('research/access/subsets.v1.json','utf8')).subsets.challenge16.tasks.join(','))")
for round in 1 2; do
  for arm in A B C N; do
    case $arm in
      A) echo A > "$state/arm"; rm -f "$state/chrome" ;;
      B) echo B > "$state/arm"; rm -f "$state/chrome" ;;
      C) echo A > "$state/arm"; echo "$cft" > "$state/chrome" ;;
      N) echo A > "$state/arm"; echo "$PWD/research/access/exit-split/chrome-noftc.sh" > "$state/chrome" ;;
    esac
    echo "{\"at\":$(date +%s),\"run\":\"$arm-$day-r$round\",\"event\":\"start\"}" >> "$dir/runs.jsonl"
    node research/access/run-set.mjs --set all --only "$ids" --access '"enhanced"' --client-timeout-ms 330000 --save-responses --grant "$grant" --arm "$arm-$day-r$round" > "$dir/run-$arm-r$round.out" 2>&1
    echo "{\"at\":$(date +%s),\"run\":\"$arm-$day-r$round\",\"event\":\"end\",\"rc\":$?}" >> "$dir/runs.jsonl"
  done
done
touch "$dir/done"
