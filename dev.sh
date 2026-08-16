#!/bin/bash

SITE_DIR=$(pwd)

bun run preprocess.ts

mv content .content_backup
mv .content_build content

if ! git rev-parse --is-inside-work-tree > /dev/null 2>&1; then
    echo "Error: The current directory is not a git repository."
    exit 1
fi

COMMIT_INFO=$(git log -1 --format="%h %ad, %s" --date=short)
echo -e "\033[36mInjecting commit into footer:\033[0m $COMMIT_INFO"

echo "const GIT_COMMIT = '$COMMIT_INFO';" > static/commit.js

echo "Building site"
cd ..
./anna "$@"
