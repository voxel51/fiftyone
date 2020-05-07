#!/usr/bin/env bash
# Generates documentation for FiftyOne.
#
# Usage:
#   bash docs/generate_docs.bash
#
# Copyright 2017-2020, Voxel51, Inc.
# voxel51.com
#

echo "**** Generating documentation"

#
# The syntax here is:
#   sphinx-apidoc [OPTIONS] -o <OUTPUT_PATH> <MODULE_PATH> [EXCLUDE_PATTERN, …]
#
sphinx-apidoc -f -o docs/source fiftyone fiftyone/experimental

cd docs
make html
cd ..

echo "**** Documentation complete"
printf "To view the docs, run:\n\nopen docs/build/html/index.html\n\n"
