#!/usr/bin/env bash
# Generates documentation for FiftyOne.
#
# Usage:
#   bash docs/generate_docs.bash
#
# Copyright 2017-2020, Voxel51, Inc.
# voxel51.com
#

set -e
cd "$(dirname "$0")/.."
echo "**** Generating documentation"

export FIFTYONE_HEADLESS=1

#
# The syntax here is:
#   sphinx-apidoc [OPTIONS] -o <OUTPUT_PATH> <MODULE_PATH> [EXCLUDE_PATTERN, …]
#
sphinx-apidoc -f --no-toc -o docs/api fiftyone fiftyone/experimental

cd docs
make html
cd ..

echo "**** Documentation complete"
printf "To view the docs, open:\n\ndocs/build/html/index.html\n\n"
