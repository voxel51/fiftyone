#!/usr/bin/env bash

cd "$(dirname "$0")"

ls dockerfiles | while read df; do
    docker build -f "dockerfiles/$df" -t "fo-test-$df" dockerfiles
done
