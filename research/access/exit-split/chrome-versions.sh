#!/bin/bash
# M3.1 driver (docs/enhanced-access-tasks.md): two Chrome builds on the same exit, two rounds each, alternating
# C156, S157, C156, S157, the 16 challenge16 tasks per run. The API runs as for M1 (W2L_CHROME_PATH=chrome.sh); arm A
# (no proxy change), and $state/chrome picks the build for each run.
state=${EXIT_SPLIT_STATE:?the state directory that chrome.sh reads}
grant=${EXIT_SPLIT_GRANT:?the grant file the API was started with}
cft=${M3_CFT_CHROME:?the Chrome for Testing 156 executable}
stable="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
ids=$(node -e "console.log(JSON.parse(require('fs').readFileSync('research/access/subsets.v1.json','utf8')).subsets.challenge16.tasks.join(','))")
echo A > "$state/arm"
for round in 1 2; do
  for build in C156 S157; do
    if [ "$build" = C156 ]; then echo "$cft" > "$state/chrome"; else echo "$stable" > "$state/chrome"; fi
    echo "{\"at\":$(date +%s),\"run\":\"$build-r$round\",\"event\":\"start\"}" >> "$state/runs.jsonl"
    node research/access/run-set.mjs --set all --only "$ids" --access '"enhanced"' --client-timeout-ms 330000 --save-responses --grant "$grant" --arm "$build-r$round" > "$state/run-$build-r$round.out" 2>&1
    echo "{\"at\":$(date +%s),\"run\":\"$build-r$round\",\"event\":\"end\",\"rc\":$?}" >> "$state/runs.jsonl"
  done
done
rm -f "$state/chrome"
