#!/bin/bash
# M1 driver (docs/enhanced-access-tasks.md): three rounds, arm A then arm B in each, the 16 challenge16 tasks per run.
# The API is already running with W2L_CHROME_PATH=research/access/exit-split/chrome.sh and the installed_chrome grant;
# forward.mjs is already listening. Each run's attempts land under .w2l/access/runs/<timestamp>/ (git-ignored).
state=${EXIT_SPLIT_STATE:?the state directory that chrome.sh reads}
grant=${EXIT_SPLIT_GRANT:?the grant file the API was started with}
ids=$(node -e "console.log(JSON.parse(require('fs').readFileSync('research/access/subsets.v1.json','utf8')).subsets.challenge16.tasks.join(','))")
for round in 1 2 3; do
  for arm in A B; do
    echo "$arm" > "$state/arm"
    echo "{\"at\":$(date +%s),\"run\":\"$arm-r$round\",\"event\":\"start\"}" >> "$state/runs.jsonl"
    node research/access/run-set.mjs --set all --only "$ids" --access '"enhanced"' --client-timeout-ms 330000 --save-responses --grant "$grant" --arm "$arm-r$round" > "$state/run-$arm-r$round.out" 2>&1
    echo "{\"at\":$(date +%s),\"run\":\"$arm-r$round\",\"event\":\"end\",\"rc\":$?}" >> "$state/runs.jsonl"
  done
done
echo A > "$state/arm"
