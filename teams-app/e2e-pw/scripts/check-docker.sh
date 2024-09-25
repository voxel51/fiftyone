#!/usr/bin/env bash

# Check if Docker is installed
if ! command -v docker &>/dev/null; then
  echo "Docker is not installed."
  exit 1
fi

# Check Docker version
docker_version=$(docker --version | awk -F'[ ,]+' '{print $3}')
required_version="23.0.0" # Minimum required version

if [[ "$(printf '%s\n' "$required_version" "$docker_version" | sort -V | head -n1)" != "$required_version" ]]; then
  echo "Docker version $required_version or higher is required, but you have $docker_version."
  exit 1
fi

# Docker is installed and meets version requirements
echo "Docker is installed and meets the minimum version requirement."

# Check if docker daemon is running
if ! docker info &>/dev/null; then
  echo "Error: docker daemon is not running."
  exit 1
fi