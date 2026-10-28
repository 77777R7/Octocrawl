#!/bin/bash
# W2L_CHROME_PATH for H2b: the installed Chrome exactly as the rung launches it, its egress pointed at the metering
# forwarder (forward.mjs, H2B_CHROME_PROXY) instead of direct://. Only that one flag changes; ADR 0005's measured
# detection flags, the profile, the debugging port and `--version` pass through untouched, and exec keeps Chrome's
# PID the launcher's child, so its kill and profile cleanup work as they do without the wrapper.
# The API runs with no environment proxy, so the http, compatible-transport and bundled-browser rungs leave from
# Cloud Run's own egress and only this Chrome reaches the arm's exit, as the hosted plan's Chrome service would.
# Any other --proxy-server means an environment proxy leaked into the run: the launch is refused rather than measured.
real=${H2B_REAL_CHROME:-/usr/bin/google-chrome}
args=()
for arg in "$@"; do
  case $arg in
    --proxy-server=direct://) args+=("--proxy-server=${H2B_CHROME_PROXY:?the forwarder, e.g. http://127.0.0.1:8796}") ;;
    --proxy-server=*) echo "h2b chrome.sh: refusing an unexpected $arg (an environment proxy reached the rung)" >&2; exit 2 ;;
    *) args+=("$arg") ;;
  esac
done
[ -n "${H2B_CHROME_LOG:-}" ] && [ "$1" != --version ] && echo "{\"chromeLaunch\":{\"at\":$(date +%s%3N),\"proxy\":\"${H2B_CHROME_PROXY:-}\",\"args\":$#}}" >> "$H2B_CHROME_LOG"
exec "$real" "${args[@]}"
