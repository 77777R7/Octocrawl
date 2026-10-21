#!/bin/bash
# Build the G4 image (Dockerfile beside this file) on Cloud Build from a shallow clone of the branch given, tag it with
# the clone's commit, and print the pushed digest. The repository's own .gcloudignore and .dockerignore leave out .git and research/ for the service
# images; this image needs both (run-set.mjs reads the commit with git), so the clone gets ignore files of its own.
# Usage: build.sh <branch> <image without tag>   (on Howard's Mac with HTTPS_PROXY, which gcloud needs here)
set -euo pipefail
branch=$1; image=$2
project=octopus-w2l-20260924-7r7
ctx=$(mktemp -d)
git clone -q --depth 1 --branch "$branch" "file://$(git rev-parse --path-format=absolute --git-common-dir)" "$ctx"
commit=$(git -C "$ctx" rev-parse --short=8 HEAD)
echo "commit $commit"
cp "$ctx/research/access/g4-cloudrun/Dockerfile" "$ctx/Dockerfile"
printf 'node_modules\n.w2l\n' > "$ctx/.dockerignore"
printf 'node_modules\n.w2l\n' > "$ctx/.gcloudignore"
gcloud builds submit "$ctx" --project "$project" --region asia-southeast1 --tag "$image:$commit" --machine-type e2-highcpu-8 --timeout 3600s
gcloud artifacts docker images describe "$image:$commit" --project "$project" --format='value(image_summary.digest)'
rm -rf "$ctx"
