#!/usr/bin/env bash
# Generates documentation for FiftyOne.
#
# Copyright 2017-2020, Voxel51, Inc.
# voxel51.com
#


# Show usage information
usage() {
    echo "Usage:  bash $0 [-h] [-c] [-s]

Options:
-h      Display this help message.
-c      Perform a clean build (deletes existing build directory).
-s      Copy static files only (CSS, JS)
"
}


# Parse flags
SHOW_HELP=false
CLEAN_BUILD=false
STATIC_ONLY=false
while getopts "hcs" FLAG; do
    case "${FLAG}" in
        h) SHOW_HELP=true ;;
        c) CLEAN_BUILD=true ;;
        s) STATIC_ONLY=true ;;
        *) usage; exit 2 ;;
    esac
done
[ ${SHOW_HELP} = true ] && usage && exit 0


set -e

export FIFTYONE_HEADLESS=1

THIS_DIR=$(dirname "$0")

if [[ ${STATIC_ONLY} = true ]]; then
    echo "**** Updating static files ****"
    rsync -av "${THIS_DIR}/source/_static/" "${THIS_DIR}/build/html/_static/"
    exit 0
fi

FIFTYONE_BRAIN_DIR=$( \
    python -c "import os, fiftyone.brain as fob; print(os.path.dirname(fob.__file__))" || \
    (echo "fiftyone-brain not installed" >&2; exit 1)
)


if [[ ${CLEAN_BUILD} = true ]]; then
    echo "**** Deleting existing build directories ****"
    rm -rf "${THIS_DIR}/source/api"
    rm -rf "${THIS_DIR}/build"
fi


echo "**** Generating documentation ****"

cd "${THIS_DIR}/.."

# Symlink to fiftyone-brain
ln -sf $FIFTYONE_BRAIN_DIR fiftyone/brain

# Generate API docs
# sphinx-apidoc [OPTIONS] -o <OUTPUT_PATH> <MODULE_PATH> [EXCLUDE_PATTERN, ...]
sphinx-apidoc --force --no-toc --separate --follow-links \
    --templatedir=docs/templates/apidoc \
    -o docs/source/api fiftyone \
        fiftyone/brain/internal \
        fiftyone/brain/pytransform \
        fiftyone/service
rm -vf docs/source/api/*pytransform*.rst

# Remove symlink
rm fiftyone/brain

cd docs

# Build docs
# sphinx-build [OPTIONS] SOURCEDIR OUTPUTDIR [FILENAMES...]
sphinx-build -M html source build $SPHINXOPTS

echo "**** Documentation complete ****"
printf "To view the docs, open:\n\ndocs/build/html/index.html\n\n"
