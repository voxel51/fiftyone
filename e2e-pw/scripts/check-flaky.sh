#!/usr/bin/env bash

# ANSI colors
purple='\033[0;35m'
green='\033[0;32m'
nc='\033[0m' # No Color

# Usage message
usage() {
  echo "Usage: $0 -s <spec_or_title> [-r <runs=5>] [-h]"
  echo "  -s  Spec file path or test title (required)"
  echo "  -r  Number of times to repeat each test (default 5)"
  echo "  -h  Show this help"
  exit 1
}

# Parse options
spec_name=""
repeat_each=5

while getopts "s:r:w:h" opt; do
  case "$opt" in
  s) spec_name="$OPTARG" ;;
  r) repeat_each="$OPTARG" ;;
  h) usage ;;
  *) usage ;;
  esac
done

# Validate required arg
if [ -z "$spec_name" ]; then
  echo "Error: -s <spec_or_title> is required."
  usage
fi

# Print a quick summary
echo -e "${purple}==> Running '$spec_name' $repeat_each time(s).${nc}"

# Call Playwright CLI
#   --repeat-each: repeats the test suite N times
npx playwright test \
  --repeat-each="$repeat_each" \
  -g "$spec_name"

exit_code=$?

echo ""
echo -e "${purple}============ FLAKE ANALYSIS REPORT ============${nc}"
if [ $exit_code -eq 0 ]; then
  echo -e "${green}No flakiness detected: all $repeat_each runs passed.${nc}"
  exit 0
else
  echo -e "${purple}Flakiness detected: at least one run failed.${nc}"
  exit 1
fi
