#!/bin/sh
set -eu
cd "$(dirname "$0")/../.."
git diff --quiet
git diff --cached --quiet
revision=$(git rev-parse HEAD)
git cat-file -e "$revision:deploy/forge/Dockerfile"
git archive --format=tar "$revision" | podman build --platform=linux/amd64 \
  --file deploy/forge/Dockerfile --build-arg "SOURCE_REVISION=$revision" \
  --tag "localhost/forge-agentmemory:$revision" -
