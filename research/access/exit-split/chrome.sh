#!/bin/bash
# W2L_CHROME_PATH for M1 (docs/enhanced-access-tasks.md): the installed Chrome exactly as the rung launches it. Only its
# exit changes, and only in arm B: ADR 0005's measured detection flags, the profile, the debugging port and `--version`
# pass through untouched, and exec keeps Chrome's PID the launcher's child. The other rungs never come through here, so
# they leave by the API's own route in both arms.
#   $EXIT_SPLIT_STATE/arm      A: the launch goes on unchanged (the exit the API gave it).
#                              B: --proxy-server is replaced by the next forwarder port (forward.mjs), one per launch.
#   $EXIT_SPLIT_STATE/counter  how many arm-B launches so far; the list never wraps (a launch past its end is refused).
#   $EXIT_SPLIT_STATE/launches.jsonl  one line per launch: time, arm, forwarder port.
state=${EXIT_SPLIT_STATE:?the state directory}
# $EXIT_SPLIT_STATE/chrome, when present, names the Chrome to launch (M3: one build against another, same exit).
real=$(cat "$state/chrome" 2>/dev/null)
[ -n "$real" ] || real=${EXIT_SPLIT_REAL_CHROME:-/Applications/Google Chrome.app/Contents/MacOS/Google Chrome}
[ "$1" = --version ] && exec "$real" "$@"
arm=$(cat "$state/arm" 2>/dev/null)
case $arm in
  A) echo "{\"at\":$(date +%s),\"arm\":\"A\",\"port\":null,\"chrome\":\"$(basename "$real")\"}" >> "$state/launches.jsonl"; exec "$real" "$@" ;;
  B) ;;
  *) echo "exit-split chrome.sh: $state/arm must hold A or B" >&2; exit 2 ;;
esac
n=$(cat "$state/counter" 2>/dev/null || echo 0)
size=${EXIT_SPLIT_SIZE:?how many proxies the forwarder holds}
[ "$n" -ge "$size" ] && { echo "exit-split chrome.sh: the proxy list is used up ($n launches)" >&2; exit 2; }
echo $((n + 1)) > "$state/counter"
port=$(( ${EXIT_SPLIT_BASE:-18900} + n ))
args=()
for arg in "$@"; do
  case $arg in
    --proxy-server=*) args+=("--proxy-server=http://127.0.0.1:$port") ;;
    *) args+=("$arg") ;;
  esac
done
echo "{\"at\":$(date +%s),\"arm\":\"B\",\"port\":$port}" >> "$state/launches.jsonl"
exec "$real" "${args[@]}"
