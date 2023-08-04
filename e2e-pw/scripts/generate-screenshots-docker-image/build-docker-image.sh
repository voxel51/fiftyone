#! /usr/bin/env bash

# exit when any command fails
set -e

# create temp .build directory, if it exists already, remove it
BUILD_DIR_NAME=".build"
if [ -d "$BUILD_DIR_NAME" ]; then
    rm -rf "$BUILD_DIR_NAME"
fi
mkdir "$BUILD_DIR_NAME"

SCREENSHOT_SCRIPTS_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" >/dev/null 2>&1 && pwd)"
SCRIPTS_DIR="$(dirname "$SCREENSHOT_SCRIPTS_DIR")"
E2E_ROOT_DIR="$(dirname "$SCRIPTS_DIR")"
FIFTYONE_ROOT_DIR="$(dirname "$E2E_ROOT_DIR")"

echo "Fiftyone root dir: $FIFTYONE_ROOT_DIR"

# copy fiftyone directory into .build
echo "Copying fiftyone directory into .build..."
rsync -aq "$FIFTYONE_ROOT_DIR"/* --exclude-from '.gitignore' \
        --exclude e2e-pw --exclude e2e --exclude app \
        --exclude .git --exclude .github --exclude .vscode \
        --exclude .gitignore --exclude .gitmodules \
        --exclude fiftyone.egg-info \
        ${BUILD_DIR_NAME}

docker build -t screenshot -f scripts/generate-screenshots-docker-image/Dockerfile .

echo "Cleanup..."
rm -rf .build
