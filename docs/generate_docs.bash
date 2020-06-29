#!/usr/bin/env bash
# Generates documentation for FiftyOne.
#
# Copyright 2017-2020, Voxel51, Inc.
# voxel51.com
#


# Show usage information
usage() {
    echo "Usage:  bash $0 [-h] [-c] -b <FIFTYONE_BRAIN_PATH>

Options:
-h      Display this help message.
-c      Perform a clean build (deletes existing build directory).
-b      Path to fiftyone-brain repository (defaults to ../fiftyone-brain)
"
}


# Parse flags
SHOW_HELP=false
CLEAN_BUILD=false
BRAIN_PATH="../fiftyone-brain"
while getopts "hcb:" FLAG; do
    case "${FLAG}" in
        h) SHOW_HELP=true ;;
        c) CLEAN_BUILD=true ;;
        b) BRAIN_PATH="${OPTARG}" ;;
        *) usage ;;
    esac
done
[ ${SHOW_HELP} = true ] && usage && exit 0


set -e
export FIFTYONE_HEADLESS=1
THIS_DIR=$(dirname "$0")

ABS_BRAIN_PATH=$( \
    python -c "import os,sys; print(os.path.realpath(sys.argv[1]))" \
    $BRAIN_PATH/fiftyone/brain)


if [[ ${CLEAN_BUILD} = true ]]; then
    echo "**** Deleting existing build directories ****"
    rm -rf "${THIS_DIR}/source/api"
    rm -rf "${THIS_DIR}/build"
fi


echo "**** Generating documentation ****"

# sphinx-apidoc [OPTIONS] -o <OUTPUT_PATH> <MODULE_PATH> [EXCLUDE_PATTERN, ...]
cd "${THIS_DIR}/.."

# create symlink to fiftyone-brain
ln -sf $ABS_BRAIN_PATH fiftyone/brain
# auto-generate API source
sphinx-apidoc -fl --no-toc -o docs/source/api fiftyone
# remove symlink
rm fiftyone/brain

# sphinx-build [OPTIONS] SOURCEDIR OUTPUTDIR [FILENAMES...]
cd docs
sphinx-build -M html source build $SPHINXOPTS  # unquoted to allow multiple args

echo "**** Documentation complete ****"
printf "To view the docs, open:\n\ndocs/build/html/index.html\n\n"
