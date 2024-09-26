#!/usr/bin/env bash

echo "Copying OSS files to a local temp directory..."

SCRIPTS_DIR=$(cd "$(dirname "${BASH_SOURCE[0]}")" >/dev/null 2>&1 && pwd)
ROOT_DIR=$(dirname ${SCRIPTS_DIR})
VOXEL_HUB_DIR=$(dirname ${ROOT_DIR})
TEAMS_DIR="${VOXEL_HUB_DIR}/fiftyone-teams"
SPECS_DIR="${TEAMS_DIR}/e2e-pw/src/oss/specs"
BUILD_DIR="${ROOT_DIR}/.oss"
BUILD_DIR_SPECS="${BUILD_DIR}/oss/specs"

MANIFEST_FILE="${ROOT_DIR}/oss.manifest"

rm -rf ${BUILD_DIR}
mkdir -p ${BUILD_DIR}

RSYNC_SRC_DIR="$VOXEL_HUB_DIR/fiftyone-teams/e2e-pw/src/"
rsync -aq "$RSYNC_SRC_DIR" --exclude-from '.gitignore' \
    --exclude fixtures --exclude specs \
    ${BUILD_DIR}
rsync -aq --files-from="$MANIFEST_FILE" ${SPECS_DIR} "$BUILD_DIR_SPECS"

echo "OSS files copied to ${BUILD_DIR}"

# Convert OSS tests to teams
echo "Converting OSS tests to Teams..."
ts-node ${ROOT_DIR}/src/oss-wrapper/index.ts
