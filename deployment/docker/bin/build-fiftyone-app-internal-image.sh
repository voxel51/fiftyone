#!/usr/bin/env bash
set -o pipefail
set -e

INTERNAL_IMAGE_NAME="${DOCKER_REPO}/fiftyone-app-internal:v${FIFTYONE_APP//+/_}"
echo "export INTERNAL_IMAGE_NAME=${INTERNAL_IMAGE_NAME}" >> /workspace/sourceme
docker build --build-arg PIP_INDEX_URL="${PIP_INDEX_URL}" \
       --secret id=PIP_EXTRA_INDEX_URL \
       --build-arg GPT_PLUGIN_IMAGE_NAME="${GPT_IMAGE_NAME}" \
       --build-arg SDK_VERSION="${SDK_VERSION}" \
       -t "${INTERNAL_IMAGE_NAME}" \
       --target internalrelease .
