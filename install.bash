#!/bin/bash
# Installs the `fiftyone` package and its dependencies.
#
# Usage:
#   bash install.bash
#
# Copyright 2017-2021, Voxel51, Inc.
# voxel51.com
#

# Show usage information
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

set -e
OS=$(uname -s)

echo "***** INSTALLING ETA *****"
if [[ ! -d "eta" ]]; then
    echo "Cloning ETA repository"
    git clone https://github.com/voxel51/eta
fi
cd eta
git checkout develop
git pull
pip install -e .
if [[ ! -f eta/config.json ]]; then
    echo "Installing default ETA config"
    cp config-example.json eta/config.json
fi
cd ..

echo "***** INSTALLING PLAYER51 *****"
git submodule update --init

echo "***** INSTALLING MONGODB *****"
mkdir -p ~/.fiftyone/bin
cd ~/.fiftyone
mkdir -p var/lib/mongo
INSTALL_MONGODB=true
if [ -x bin/mongod ]; then
    VERSION_FULL=$(bin/mongod --version | grep 'db version')
    VERSION="${VERSION_FULL:12}"
    if [ ${VERSION} != "4.4.2" ]; then
        echo "Upgrading MongoDB v${VERSION} to v4.4.2"
    else
        echo "MongoDB v4.4.2 already installed"
        INSTALL_MONGODB=false
    fi
else
    echo "Installing MongoDB v4.4.2"
fi
if [ ${INSTALL_MONGODB} = true ]; then
    if [ "${OS}" == "Darwin" ]; then
        MONGODB_BUILD=mongodb-macos-x86_64-4.4.2

        curl https://fastdl.mongodb.org/osx/${MONGODB_BUILD}.tgz --output mongodb.tgz
        tar -zxvf mongodb.tgz
        mv ${MONGODB_BUILD}/bin/* ./bin/
        rm mongodb.tgz
        rm -rf ${MONGODB_BUILD}
    elif [ "${OS}" == "Linux" ]; then
        MONGODB_BUILD=mongodb-linux-x86_64-ubuntu1804-4.4.2

        curl https://fastdl.mongodb.org/linux/${MONGODB_BUILD}.tgz --output mongodb.tgz
        tar -zxvf mongodb.tgz
        mv ${MONGODB_BUILD}/bin/* ./bin/
        rm mongodb.tgz
        rm -rf ${MONGODB_BUILD}
    else
        echo "WARNING: unsupported OS, skipping MongoDB installation"
    fi
fi
cd -

echo "***** INSTALLING FIFTYONE *****"
if [ ${DEV_INSTALL} = true ]; then
    echo "Performing dev install"
    pip install -r requirements/dev.txt
    pre-commit install
else
    pip install -r requirements.txt
fi
pip install -e .

echo "***** INSTALLING APP *****"
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.37.2/install.sh | bash
export NVM_DIR="$([ -z "${XDG_CONFIG_HOME-}" ] && printf %s "${HOME}/.nvm" || printf %s "${XDG_CONFIG_HOME}/nvm")"
[ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh" # This loads nvm
nvm install v12.16.2
nvm use v12.16.2
npm -g install yarn
if [ -f ~/.bashrc ]; then
    source ~/.bashrc
elif [ -f ~/.bash_profile ]; then
    source ~/.bash_profile
else
    echo "WARNING: unable to locate a bash profile to 'source'; you may need to start a new shell"
fi
cd app
yarn install > /dev/null 2>&1
yarn build-web
cd ..

echo "***** INSTALLATION COMPLETE *****"
