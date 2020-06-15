#!/usr/bin/env bash

cd "$(dirname "$0")"

docker run -it --rm --network host --name "fo-$1" -v "$PWD/pip-cache:/root/.cache/pip" "fo-test-$1"
