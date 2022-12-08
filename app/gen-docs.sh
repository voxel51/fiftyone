#!/usr/bin/env bash
# Generates documentation for FiftyOne app & plugins.

DOCS_JSON_FILE="docs.json"

echo "Generating doc JSON... at $DOCS_JSON_FILE"
npx typedoc --options typedoc.js --json $DOCS_JSON_FILE

node gen-docs.js $DOCS_JSON_FILE

echo "Finished generating docs!"