#!/bin/bash

# ANSI color codes
purple='\033[0;35m'
green='\033[0;32m'
nc='\033[0m' # No Color

# Function to display help message
display_help() {
    echo "Usage: $0 -s SPEC_FILE_OR_DESCRIPTION [OPTIONS]"
    echo "Options:"
    echo "  -s SPEC_FILE_OR_DESCRIPTION     Specify the spec file name or description of the test unit"

    echo "  -r NUM_REPS                     Set the total runs (default: 5)"
    echo "  -h                              Display this help message"
    exit 0
}

# Function to handle SIGINT signal (Ctrl+C)
cleanup() {
    echo -e "${purple}Ctrl+C detected. Stopping all tests.${nc}"
    exit 1
}
trap cleanup SIGINT

# Function to run the Playwright test spec
run_test() {
    # if $spec_file ends in .ts, it's a spec name and not test title

    if [[ $spec_name == *.ts ]]; then
        npx playwright test -c playwright.config.ts $spec_name
        return
    fi
    
    npx playwright test -c playwright.config.ts -g "$spec_name" 
}

# Default values for keyword arguments
total_runs=5
spec_name=""

# Parse command-line options using getopts
while getopts ":r:s:h" opt; do
    case $opt in
    r) total_runs="$OPTARG" ;;
    s) spec_name="$OPTARG" ;;
    h) display_help ;;
    \?)
        echo "Invalid option -$OPTARG"
        exit 1
        ;;
    esac
done

# Check if -s option is provided
if [ -z "$spec_name" ]; then
    echo "Error: Spec file name/description is required. Use '-s SPEC_FILE_OR_DESCRIPTION' to specify the spec file."
    display_help
fi

flaky_tests=0

# Loop to run the test multiple times
for ((i = 1; i <= total_runs; i++)); do
    echo -e "${purple}RUNNING TEST: $i${nc}"
    run_test &
    wait $! # Wait for the background process to finish and get its exit code
    exit_code=$?

    if [ $exit_code -ne 0 ]; then
        echo -e "${purple}TEST RUN $i FAILED!${nc}"
        ((flaky_tests++))
    else
        echo -e "${green}TEST RUN NUMBER $i PASSED!${nc}"
    fi
    
    status="REMAINING RUNS=$((total_runs - i)). TOTAL SUCCESSFUL TESTS=$((i - flaky_tests)). TOTAL FAILED TESTS=$flaky_tests."
    if [ $flaky_tests -eq 0 ]; then
        echo -e "${green}$status${nc}"
    else
        echo -e "${purple}$status${nc}"
    fi

    echo -e "${purple}=============================${nc}"
done

echo -e "${purple}\n\n\n============FLAKE ANALYSIS REPORT=================${nc}"

# Check for flaky tests
if [ $flaky_tests -gt 0 ]; then
    echo -e "${purple}THIS TEST IS FLAKY! $flaky_tests OUT OF $total_runs RUNS FAILED.${nc}"
else
    echo -e "${green}NO FLAKY TESTS DETECTED. ALL $total_runs TESTS PASSED. 🎉${nc}"
fi

exit $flaky_tests
