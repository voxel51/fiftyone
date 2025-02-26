#!/usr/bin/env bash

BIND="${FIFTYONE_DEFAULT_APP_ADDRESS:-0.0.0.0}":"${FIFTYONE_DEFAULT_APP_PORT:-5151}"

flags=()

# Find all of the `HYPERCORN_` environment variables
# and convert them to their command-line equivalents.
# For example: `HYPERCORN_WORKERS=4` would evaluate to
# --workers 4
for var in $(env | grep HYPERCORN_ | cut -d '=' -f 1); do
    flag_name=$(echo "${var/HYPERCORN_/}" | awk '{print tolower($0)}' | sed 's/_/-/g')
    flag_value=$(printenv "$var")
    flags+=("--$flag_name" "$flag_value")
done

hypercorn fiftyone.teams.app:app --bind "${BIND}" "${flags[@]}"
