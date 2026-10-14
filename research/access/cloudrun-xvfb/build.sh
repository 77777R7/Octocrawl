#!/bin/bash
# Build the measurement image (Dockerfile beside this file) on Cloud Build from a shallow clone of the branch given.
# The repository's own .gcloudignore and .dockerignore leave out .git and research/ for the service images; this
# image needs both (run-set.mjs reads the commit with git), so the clone gets ignore files of its own.
# Usage: build.sh <branch> <image>   (from a machine whose gcloud reaches Cloud Build; on Howard's Mac with HTTPS_PROXY)
set -euo pipefail
branch=$1; image=$2
ctx=$(mktemp -d)
git clone -q --depth 1 --branch "$branch" "file://$(git rev-parse --path-format=absolute --git-common-dir)" "$ctx"
cp "$ctx/research/access/cloudrun-xvfb/Dockerfile" "$ctx/Dockerfile"
printf 'node_modules\n.w2l\n' > "$ctx/.dockerignore"
printf 'node_modules\n.w2l\n' > "$ctx/.gcloudignore"
gcloud builds submit "$ctx" --project octopus-w2l-20260924-7r7 --region asia-southeast1 --tag "$image" --machine-type e2-highcpu-8 --timeout 3600s
rm -rf "$ctx"
