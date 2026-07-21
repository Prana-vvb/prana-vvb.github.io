#!/bin/bash

if [ -d ".content_backup" ]; then
    echo "Found leftover backup from a previous interrupted run. Restoring original files..."
    rm -rf content
    mv .content_backup content
fi

bun run preprocess.ts

mv content .content_backup
mv .content_build content

trap 'echo -e "\nRestoring content directory..."; rm -rf content; mv .content_backup content; rm -rf .content_build; exit 0' INT TERM

echo "Starting Anna server..."
~/.scripts/build_site.sh "$@"
