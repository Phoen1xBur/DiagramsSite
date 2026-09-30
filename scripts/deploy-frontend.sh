#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
SHA="$(git rev-parse --short HEAD)"
export GIT_SHA="$SHA"
echo "Building frontend with GIT_SHA=$GIT_SHA"
docker compose build --build-arg GIT_SHA="$GIT_SHA" frontend
docker compose up -d frontend
echo "Deployed frontend @ $GIT_SHA"
