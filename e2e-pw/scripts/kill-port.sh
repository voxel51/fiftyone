#!/bin/bash

# Check if the port number is provided as an argument
if [[ $# -ne 1 ]]; then
  echo "Usage: $0 <port>"
  exit 1
fi

# Get the port number from the command line argument
port="$1"

# Find the process IDs using the specified port
pids=($(lsof -t -i :"$port"))

if [[ ${#pids[@]} -eq 0 ]]; then
  echo "No process found using port $port"
  exit 1
fi

# Kill the processes
for pid in "${pids[@]}"; do
  kill "$pid"
done

echo "Processes with PIDs ${pids[*]} have been killed"

