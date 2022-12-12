#!/usr/bin/env bash
# Generates documentation for FiftyOne app & plugins.

# parse the following flags into variables
# --rebuild-sphinx: rebuild the sphinx docs
REBUILD_SHPINX=false
REBUILD_TYPEDOC=true
DOCS_JSON_FILE="docs.json"

while [[ $# -gt 0 ]]; do
    key="$1"
    case $key in
        --skip-typedoc)
            REBUILD_TYPEDOC=false
            shift
            ;;
        --rebuild-sphinx)
            REBUILD_SHPINX=true
            shift
            ;;
        *)
            echo "Unknown flag: $key"
            exit 1
            ;;
    esac
done

if [ "$REBUILD_TYPEDOC" = true ] ; then
  echo "Rebuilding typedoc JSON..."
  echo "Generating doc JSON... at $DOCS_JSON_FILE"
  npx typedoc --options typedoc.js --json $DOCS_JSON_FILE
fi

node gen-docs.js $DOCS_JSON_FILE

# print error if the previous command failed
if [ $? -ne 0 ]; then
  echo "Error generating docs!"
  exit 1
fi

# if REBUILD_SPHINX is true, rebuild the sphinx docs
if [ "$REBUILD_SHPINX" = true ] ; then
  echo "Rebuilding sphinx docs..."
  cd ../docs
  sphinx-build -M html source build
  cd ../app
fi

echo "Finished generating docs!"