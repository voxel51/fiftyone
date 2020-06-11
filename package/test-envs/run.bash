#!/usr/bin/env bash

cd "$(dirname "$0")"

docker run -it --rm --network host -v "$PWD/pip-cache:/root/.cache/pip" "fo-test-$1"
