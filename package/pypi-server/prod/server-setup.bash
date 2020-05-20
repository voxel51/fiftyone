#!/usr/bin/env bash

if [[ -z "$1" ]]; then
    echo "Usage: $0 HOSTNAME"
    exit 2
fi
hostname="$1"
username="$(whoami)"

cd "$(dirname "$0")"
echo "This script is intended to be run on a fresh server to set up a PyPI registry."
read -p "Continue? [y/N] " reply
echo ""
if [[ ! "$reply" =~ [yY] ]]; then
    exit 1
fi

set -ex

sudo apt update
sudo apt upgrade

sudo apt install \
    apache2-utils \
    certbot \
    docker-compose \
    docker.io \
    nginx \
    python3-certbot-nginx
# make Docker start on boot
sudo systemctl enable docker.service

touch htpasswd.txt

sudo certbot run --nginx -d pypi.voxel51.com

sudo rm -f /etc/nginx/sites-enabled/default
sudo cp pypi.voxel51.com.conf /etc/nginx/sites-enabled

# set up docker permissions - if this fails, log out, log in, and try again
sudo usermod -a -G docker "$username"
sudo -u "$username" docker-compose up -d

set +x
echo "Installation successful! Now run ./add-user.bash to set up a PyPI user."
