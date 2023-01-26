#!/bin/bash
# Installs the `fiftyone` package and its dependencies.
#
# Usage:
#   bash install.bash
#
# Copyright 2017-2023, Voxel51, Inc.
# voxel51.com
#

# Show usage information
usage() {
    echo "Usage:  bash $0 [-h] [-d] [-e] [-m] [-p] [-v]

Getting help:
-h      Display this help message.

Custom installations:
-d      Install developer dependencies.
-e      Source install of voxel51-eta.
-m      Install MongoDB from scratch, rather than installing fiftyone-db.
-p      Install only the core python package, not the App.
-v      Voxel51 developer install (don't install fiftyone-brain).
"
}

# Parse flags
SHOW_HELP=false
DEV_INSTALL=false
SOURCE_ETA_INSTALL=false
SCRATCH_MONGODB_INSTALL=false
BUILD_APP=true
VOXEL51_INSTALL=false
while getopts "hdempv" FLAG; do
    case "${FLAG}" in
        h) SHOW_HELP=true ;;
        d) DEV_INSTALL=true ;;
        e) SOURCE_ETA_INSTALL=true ;;
        m) SCRATCH_MONGODB_INSTALL=true ;;
        v) VOXEL51_INSTALL=true ;;
        p) BUILD_APP=false ;;
        *) usage ;;
    esac
done
[ ${SHOW_HELP} = true ] && usage && exit 0

set -e
NODE_VERSION=17.9.0
OS=$(uname -s)
ARCH=$(uname -m)

if [ ${SCRATCH_MONGODB_INSTALL} = true ]; then
    echo "***** INSTALLING MONGODB *****"
    mkdir -p ~/.fiftyone/bin
    cd ~/.fiftyone
    mkdir -p var/lib/mongo
    INSTALL_MONGODB=true
    if [ -x bin/mongod ]; then
        VERSION_FULL=$(bin/mongod --version | grep 'db version')
        VERSION="${VERSION_FULL:12}"
        if [ "${OS}" == "Darwin" ] && [ "${ARCH}" == "arm64" ]; then
            if [ ${VERSION} != "6.0.2" ]; then
                echo "Upgrading MongoDB v${VERSION} to v6.0.2"
            else
                echo "MongoDB v6.0.2 already installed"
                INSTALL_MONGODB=false
            fi
        else
            if [ ${VERSION} != "5.0.4" ]; then
                echo "Upgrading MongoDB v${VERSION} to v5.0.4"
            else
                echo "MongoDB v5.0.4 already installed"
                INSTALL_MONGODB=false
            fi
        fi
    else
        echo "Installing MongoDB v5.0.4"
    fi
    if [ ${INSTALL_MONGODB} = true ]; then
        MONGODB_VERSION=5.0.4
        if [ "${OS}" == "Darwin" ]; then
            if [ "${ARCH}" == "arm64" ]; then
                MONGODB_VERSION=6.0.2
            fi
            MONGODB_BUILD=mongodb-macos-x86_64-${MONGODB_VERSION}

            curl https://fastdl.mongodb.org/osx/${MONGODB_BUILD}.tgz --output mongodb.tgz
            tar -zxvf mongodb.tgz
            mv ${MONGODB_BUILD}/bin/* ./bin/
            rm mongodb.tgz
            rm -rf ${MONGODB_BUILD}
        elif [ "${OS}" == "Linux" ]; then
            MONGODB_BUILD=mongodb-linux-x86_64-ubuntu2004-${MONGODB_VERSION}

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
else
    echo "***** INSTALLING FIFTYONE-DB *****"
    pip install fiftyone-db
fi

if [ ${VOXEL51_INSTALL} = false ]; then
    echo "***** INSTALLING FIFTYONE-BRAIN *****"
    pip install fiftyone-brain
fi

echo "***** INSTALLING FIFTYONE *****"
if [ ${DEV_INSTALL} = true ] || [ ${VOXEL51_INSTALL} = true ]; then
    echo "Performing dev install"
    pip install -r requirements/dev.txt
    pre-commit install
    pip install -e .
else
    pip install -r requirements.txt
    pip install .
fi

if [ ${SOURCE_ETA_INSTALL} = true ]; then
    echo "***** INSTALLING ETA *****"
    if [[ ! -d "eta" ]]; then
        echo "Cloning ETA repository"
        git clone https://github.com/voxel51/eta
    fi
    cd eta
    if [ ${DEV_INSTALL} = true ] || [ ${VOXEL51_INSTALL} = true ]; then
        pip install -e .
    else
        pip install .
    fi
    if [[ ! -f eta/config.json ]]; then
        echo "Installing default ETA config"
        cp config-example.json eta/config.json
    fi
    cd ..
fi

# Do this last since `source` can exit Python virtual environments
if [ ${BUILD_APP} = true ]; then
    echo "***** INSTALLING FIFTYONE-APP *****"
    curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.37.2/install.sh | bash
    export NVM_DIR="$([ -z "${XDG_CONFIG_HOME-}" ] && printf %s "${HOME}/.nvm" || printf %s "${XDG_CONFIG_HOME}/nvm")"
    [ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh" # This loads nvm
    nvm install ${NODE_VERSION}
    nvm use ${NODE_VERSION}
    npm -g install yarn
    if [ -f ~/.bashrc ]; then
        source ~/.bashrc
    elif [ -f ~/.bash_profile ]; then
        source ~/.bash_profile
    else
        echo "WARNING: unable to locate a bash profile to 'source'; you may need to start a new shell"
    fi
    cd app
    echo "Building the App. This will take a minute or two..."
    yarn install > /dev/null 2>&1
    yarn build
    cd ..
fi

echo "***** INSTALLATION COMPLETE *****"
