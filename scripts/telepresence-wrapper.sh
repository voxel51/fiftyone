#!/bin/bash

# Maximum number of retries
MAX_RETRIES=3

# Counter for retries
retry_count=0

# Check if arguments are provided
if [ $# -lt 2 ]; then
  echo "Usage: $0 <service-name> --port <local-port>:<remote-port>"
  exit 1
fi

# Collect arguments for the intercept command
args="$@"

# Retry logic
while (( retry_count < MAX_RETRIES )); do
  echo "Attempt $((retry_count + 1)) of $MAX_RETRIES..."

  # Run the command
  if telepresence intercept $args; then
    echo "Intercept succeeded!"
    exit 0
  else
    echo "Intercept failed. Retrying..."
    ((retry_count++))
    sleep 2  # Optional: Add a delay before retrying
  fi
done

echo "Intercept failed after $MAX_RETRIES attempts."
exit 1
