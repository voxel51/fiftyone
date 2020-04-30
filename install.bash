#!/bin/bash
# Installs the `fiftyone` package and its dependencies.
#
# Usage:
#   bash install.bash
#
# Copyright 2017-2020, Voxel51, Inc.
# voxel51.com
#

# Show usage information
set -e
usage() {
    echo "Usage:  bash $0 [-h] [-d]

Getting help:
-h      Display this help message.

Custom installations:
-d      Install developer dependencies. The default is false.
"
}


# Parse flags
SHOW_HELP=false
DEV_INSTALL=false
while getopts "hd" FLAG; do
    case "${FLAG}" in
        h) SHOW_HELP=true ;;
        d) DEV_INSTALL=true ;;
        *) usage ;;
    esac
done
[ ${SHOW_HELP} = true ] && usage && exit 0
OS=$(uname -s)

echo "***** INSTALLING ETA *****"
if [[ ! -d "eta" ]]; then
    echo "Cloning ETA repository"
    git clone https://github.com/voxel51/eta
fi
cd eta
bash install.bash
if [[ ! -f config.json ]]; then
    echo "Installing default ETA config"
    cp config-example.json config.json
fi
cd ..


echo "***** INSTALLING MONGODB *****"
mkdir -p ~/.fiftyone/bin
cd ~/.fiftyone
mkdir -p var/log/mongodb
mkdir -p var/lib/mongo
if [ "${OS}" == "Darwin" ]; then
    curl https://fastdl.mongodb.org/osx/mongodb-macos-x86_64-4.2.6.tgz --output mongodb.tgz
    tar -zxvf mongodb.tgz
    mv mongodb-macos-x86_64-4.2.6/bin/* ./bin/
    rm mongodb.tgz
    rm -rf mongodb-macos-x86_64-4.2.6
elif [ "${OS}" == "Linux" ]; then
    sudo apt-get install libcurl4 openssl
    curl https://fastdl.mongodb.org/linux/mongodb-linux-x86_64-ubuntu1804-4.2.6.tgz --output mongodb.tgz
    tar -zxvf mongodb.tgz
    mv mongodb-linux-x86_64-ubuntu1804-4.2.6/bin/* ./bin/
    rm mongodb.tgz
    rm -rf mongodb-linux-x86_64-ubuntu1804-4.2.6
fi
cd -


echo "***** INSTALLING ELECTRON APP *****"
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.35.3/install.sh | bash
export NVM_DIR="$HOME/.nvm"
# This loads nvm
[ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"
# This loads nvm bash_completion
[ -s "$NVM_DIR/bash_completion" ] && \. "$NVM_DIR/bash_completion"
nvm install v12.16.2
nvm use v12.16.2
cd electron
npm install -g yarn
yarn install
cd ..


echo "***** INSTALLING FIFTYONE *****"
if [ ${DEV_INSTALL} = true ]; then
    echo "Performing dev install"
    pip install -r requirements/dev.txt
    pre-commit install
else
    pip install -r requirements.txt
fi
pip install -e .


echo "***** INSTALLATION COMPLETE *****"
