#!/usr/bin/env bash
# Run all unit tests.
#
# Copyright 2017-2020, Voxel51, Inc.
# voxel51.com
#

THIS_DIR=$(dirname "$0")

for test in $(ls ${THIS_DIR}/*_tests.py); do
    python "$test"
done
