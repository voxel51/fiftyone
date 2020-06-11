#!/usr/bin/env bash

cd "$(dirname "$0")"

set -e
ls dockerfiles | while read df; do
    docker build -t "fo-test-$df" - < "dockerfiles/$df"
done
