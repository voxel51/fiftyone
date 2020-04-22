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

sphinx-apidoc -f -o docs/source fiftyone/

cd docs
make html
cd ..

echo "**** Documentation complete"
printf "To view the docs, run:\n\nopen docs/build/html/index.html\n\n"
