#!/usr/bin/env bash

cd "$(dirname "$0")"

set -e

files=($(ls dockerfiles))
if [ $# -ge 1 ]; then
    files=("$@")
fi

for df in "${files[@]}"; do
    docker build -t "fo-test-$df" - < "dockerfiles/$df"
done
