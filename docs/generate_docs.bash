#!/usr/bin/env bash
# Generates documentation for FiftyOne.
#
# Copyright 2017-2025, Voxel51, Inc.
# voxel51.com
#


# Show usage information
usage() {
    echo "Usage:  bash $0 [-h] [-f] [-c] [-s] [-t]

Options:
-h      Display this help message.
-f      Perform a fast build (don't regenerate zoo/plugin docs).
-c      Perform a clean build (deletes existing build directory).
-s      Copy static files only (CSS, JS).
-t      Path to fiftyone-teams clone to use for Teams docs
"
}


# Parse flags
SHOW_HELP=false
FAST_BUILD=false
CLEAN_BUILD=false
STATIC_ONLY=false
PATH_TO_TEAMS=""
while getopts "hfcst:" FLAG; do
    case "${FLAG}" in
        h) SHOW_HELP=true ;;
        f) FAST_BUILD=true ;;
        c) CLEAN_BUILD=true ;;
        s) STATIC_ONLY=true ;;
        t) PATH_TO_TEAMS=$OPTARG;;
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

FIFTYONE_BRAIN_DIR=$(
    python -c "import os, fiftyone.brain as fob; print(os.path.dirname(fob.__file__))" ||
    true
)
# Get the last line from the output. Github workflows produce extraneous output
FIFTYONE_BRAIN_DIR="${FIFTYONE_BRAIN_DIR##*$'\n'}"

if [[ -z "${FIFTYONE_BRAIN_DIR}" ]] || [[ ! -d "${FIFTYONE_BRAIN_DIR}" ]]; then
    echo "fiftyone-brain not installed" >&2
    # workaround for https://github.com/voxel51/fiftyone/issues/583
    echo "Importing fiftyone.brain produced the following output:" >&2
    echo "${FIFTYONE_BRAIN_DIR}" >&2
    exit 1
fi

if [[ ${CLEAN_BUILD} = true ]]; then
    echo "**** Deleting existing build directories ****"
    rm -rf "${THIS_DIR}/source/api"
    rm -rf "${THIS_DIR}/build"
fi


echo "**** Generating documentation ****"

# Symlink to fiftyone-teams
if [[ -n "${PATH_TO_TEAMS}" ]]; then
    # macOS users may need to run `brew install coreutils` to get `realpath``
    PATH_TO_TEAMS="$(realpath "$PATH_TO_TEAMS")"

    cd "${THIS_DIR}"
    PATH_TO_FIFTYONE_DIR=$(
        python -c "import os, fiftyone as fo; print(os.path.dirname(fo.__file__))" ||
        true
    )
    cd -

    ln -sfn "${PATH_TO_TEAMS}/fiftyone/management" "${PATH_TO_FIFTYONE_DIR}/management"
    ln -sfn "${PATH_TO_TEAMS}/fiftyone/api" "${PATH_TO_FIFTYONE_DIR}/api"
    echo "Linking to fiftyone-teams at: ${PATH_TO_TEAMS}"
    echo "In fiftyone path: ${PATH_TO_FIFTYONE_DIR}"
fi

cd "${THIS_DIR}/.."

# Symlink to fiftyone-brain
ln -sfn "$FIFTYONE_BRAIN_DIR" fiftyone/brain

echo "Generating API docs"
# sphinx-apidoc [OPTIONS] -o <OUTPUT_PATH> <MODULE_PATH> [EXCLUDE_PATTERN, ...]
sphinx-apidoc --force --no-toc --separate --follow-links \
    --templatedir=docs/templates/apidoc \
    -o docs/source/api fiftyone \
        fiftyone/brain/internal/models \
        fiftyone/constants \
        fiftyone/internal \
        fiftyone/server \
        fiftyone/service \
        fiftyone/management \
        fiftyone/api

sphinx-apidoc --force --no-toc --separate --follow-links \
    --templatedir=docs/templates/apidoc \
    -o docs/source/plugins/api plugins

# Remove symlink
unlink fiftyone/brain

cd docs

if [[ ${FAST_BUILD} = false ]]; then
    echo "Generating model zoo listing page"
    python scripts/make_model_zoo_docs.py

    echo "Generating TypeScript API docs"
    cd ../app
    yarn doc
    cd ../docs
fi

echo "Building docs"
# sphinx-build [OPTIONS] SOURCEDIR OUTPUTDIR [FILENAMES...]
sphinx-build -M html source build $SPHINXOPTS

# Remove symlink to fiftyone-teams
if [[ -n "${PATH_TO_TEAMS}" ]]; then
    unlink "$PATH_TO_FIFTYONE_DIR/management"
    unlink "$PATH_TO_FIFTYONE_DIR/api"
fi

echo "Post-processing docs"
node ./scripts/post-process.js

echo "**** Documentation complete ****"
printf "To view the docs, open:\n\ndocs/build/html/index.html\n\n"
