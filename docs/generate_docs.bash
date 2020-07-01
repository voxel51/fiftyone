#!/usr/bin/env bash
# Generates documentation for FiftyOne.
#
# Copyright 2017-2020, Voxel51, Inc.
# voxel51.com
#


# Show usage information
usage() {
    echo "Usage:  bash $0 [-h] [-c]

Options:
-h      Display this help message.
-c      Perform a clean build (deletes existing build directory).
"
}


# Parse flags
SHOW_HELP=false
CLEAN_BUILD=false
while getopts "hcb:" FLAG; do
    case "${FLAG}" in
        h) SHOW_HELP=true ;;
        c) CLEAN_BUILD=true ;;
        *) usage ;;
    esac
done
[ ${SHOW_HELP} = true ] && usage && exit 0


set -e

export FIFTYONE_HEADLESS=1

THIS_DIR=$(dirname "$0")
FIFTYONE_BRAIN_DIR=$( \
    python -c "import fiftyone.brain as fob; print('/'.join(fob.__file__.split('/')[:-3]))" \
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
sphinx-apidoc -fl --no-toc -o docs/source/api fiftyone

# Remove symlink
rm fiftyone/brain

cd docs

# Build docs
# sphinx-build [OPTIONS] SOURCEDIR OUTPUTDIR [FILENAMES...]
sphinx-build -M html source build $SPHINXOPTS

echo "**** Documentation complete ****"
printf "To view the docs, open:\n\ndocs/build/html/index.html\n\n"
