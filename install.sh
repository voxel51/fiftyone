#!/bin/sh
# Installs the `fiftyone` package and its dependencies.
#
# Usage:
#   sh install.sh
#
# Copyright 2017-2025, Voxel51, Inc.
# voxel51.com
#

# Show usage information
usage() {
    echo "Usage:  sh $0 [-h] [-b] [-d] [-e] [-m] [-p] [-o]

Getting help:
-h      Display this help message.

Custom installations:
-b      Source install of fiftyone-brain.
-d      Install developer dependencies.
-e      Source install of voxel51-eta.
-m      Install MongoDB from scratch, rather than installing fiftyone-db.
-p      Install only the core python package, not the App.
-o      Install docs dependencies.
"
}

# Parse flags
SHOW_HELP=false
SOURCE_BRAIN_INSTALL=false
DEV_INSTALL=false
DOCS_INSTALL=false
SOURCE_ETA_INSTALL=false
SCRATCH_MONGODB_INSTALL=false
BUILD_APP=true
while getopts "hbdempo" FLAG; do
    case "${FLAG}" in
        h) SHOW_HELP=true ;;
        b) SOURCE_BRAIN_INSTALL=true ;;
        d) DEV_INSTALL=true ;;
        e) SOURCE_ETA_INSTALL=true ;;
        m) SCRATCH_MONGODB_INSTALL=true ;;
        p) BUILD_APP=false ;;
        o) DOCS_INSTALL=true ;;
        *)
            usage
            exit 1
            ;;
    esac
done
[ "$SHOW_HELP" = true ] && usage && exit 0

set -e
NODE_VERSION=22.14.0
OS=$(uname -s)
ARCH=$(uname -m)

MIN_MINOR=9
MAX_MINOR=12

if command -v python3 >/dev/null 2>&1; then
    PYTHON=python3
elif command -v python >/dev/null 2>&1; then
    PYTHON=python
else
    echo "ERROR: Neither python3 nor python found in PATH."
    exit 1
fi

# Extract major.minor version info
PY_VER=$($PYTHON -c 'import sys; print(f"{sys.version_info.major}.{sys.version_info.minor}")')
MAJOR=$(echo "$PY_VER" | cut -d. -f1)
MINOR=$(echo "$PY_VER" | cut -d. -f2)

if [ "$MAJOR" -ne 3 ] || [ "$MINOR" -lt "$MIN_MINOR" ] || [ "$MINOR" -gt "$MAX_MINOR" ]; then
    echo "Python $PY_VER is NOT supported. Please use Python 3.$MIN_MINOR - 3.$MAX_MINOR."
    exit 1
fi

echo "Python $PY_VER is supported."
# Do this first so pip installs with a built app
if [ "$BUILD_APP" = true ]; then
    echo "***** INSTALLING FIFTYONE-APP *****"
    if ! command -v nvm >/dev/null 2>&1; then
        echo "Installing nvm..."
        curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.37.2/install.sh | sh
    else
        echo "nvm is already installed, skipping installation"
    fi
    if [ -z "$XDG_CONFIG_HOME" ]; then
        NVM_DIR="${HOME}/.nvm"
    else
        NVM_DIR="${XDG_CONFIG_HOME}/nvm"
    fi
    export NVM_DIR
    if [ -s "$NVM_DIR/nvm.sh" ]; then
        . "$NVM_DIR/nvm.sh"
    fi
    nvm install "$NODE_VERSION"
    nvm use "$NODE_VERSION"
    if ! command -v yarn >/dev/null 2>&1; then
        echo "Installing yarn..."
        npm install -g yarn
    else
        echo "yarn is already installed, skipping installation"
    fi
    cd app
    echo "Building the App. This will take a minute or two..."
    corepack enable
    corepack prepare yarn --activate
    COREPACK_ENABLE_DOWNLOAD_PROMPT=0 yarn install >/dev/null 2>&1
    yarn build
    cd ..
fi

if [ "$SCRATCH_MONGODB_INSTALL" = true ]; then
    echo "***** INSTALLING MONGODB FROM SCRATCH *****"
    MONGODB_VERSION=6.0.5
    INSTALL_MONGODB=true

    mkdir -p "$HOME/.fiftyone/bin"
    cd "$HOME/.fiftyone"
    mkdir -p var/lib/mongo
    if [ -x bin/mongod ]; then
        VERSION_FULL=$(bin/mongod --version | grep 'db version')
        CURRENT_VERSION=$(echo "$VERSION_FULL" | cut -d" " -f3)
        if [ "$CURRENT_VERSION" != "$MONGODB_VERSION" ]; then
            echo "Upgrading MongoDB v$CURRENT_VERSION to v$MONGODB_VERSION"
        else
            echo "MongoDB v$MONGODB_VERSION already installed"
            INSTALL_MONGODB=false
        fi
    fi

    if [ "$INSTALL_MONGODB" = true ]; then
        echo "Installing MongoDB v$MONGODB_VERSION"
        if [ "$OS" = "Darwin" ]; then
            MONGODB_BUILD="mongodb-macos-x86_64-$MONGODB_VERSION"
            curl "https://fastdl.mongodb.org/osx/${MONGODB_BUILD}.tgz" --output mongodb.tgz
            tar -zxvf mongodb.tgz
            mv "${MONGODB_BUILD}/bin/"* ./bin/
            rm -rf mongodb.tgz "${MONGODB_BUILD}"
        elif [ "$OS" = "Linux" ]; then
            MONGODB_BUILD="mongodb-linux-x86_64-ubuntu2204-$MONGODB_VERSION"
            curl "https://fastdl.mongodb.org/linux/${MONGODB_BUILD}.tgz" --output mongodb.tgz
            tar -zxvf mongodb.tgz
            mv "${MONGODB_BUILD}/bin/"* ./bin/
            rm -rf mongodb.tgz "${MONGODB_BUILD}"
        else
            echo "WARNING: unsupported OS, skipping MongoDB installation"
        fi
    fi
    cd -
else
    echo "***** INSTALLING FIFTYONE-DB *****"
    pip install fiftyone-db
fi

echo "***** INSTALLING FIFTYONE-BRAIN *****"
if [ "$SOURCE_BRAIN_INSTALL" = true ]; then
    if [ ! -d "fiftyone-brain" ] && [ ! -d "../fiftyone-brain" ]; then
        echo "Cloning FiftyOne Brain repository"
        git clone https://github.com/voxel51/fiftyone-brain
    fi
    if [ -d "../fiftyone-brain" ]; then
        cd ../fiftyone-brain
    else
        cd fiftyone-brain
    fi
    if [ "$DEV_INSTALL" = true ]; then
        echo "Performing dev install"
        sh install.sh -d
    else
        echo "Performing install"
        pip install .
    fi
    cd -
else
    pip install --upgrade fiftyone-brain
fi

echo "***** INSTALLING FIFTYONE *****"
if [ "$DEV_INSTALL" = true ]; then
    echo "Performing dev install"
    pip install -r requirements/dev.txt
    pre-commit install
    pip install -e .
elif [ "$DOCS_INSTALL" = true ]; then
    echo "Performing docs install"
    pip install -r requirements/docs.txt
    pip install -e .
else
    echo "Performing install"
    pip install .
fi

if [ "$SOURCE_ETA_INSTALL" = true ]; then
    echo "***** INSTALLING ETA FROM SOURCE *****"
    if [ ! -d "eta" ] && [ ! -d "../eta" ]; then
        echo "Cloning ETA repository"
        git clone https://github.com/voxel51/eta
    fi
    if [ -d "../eta" ]; then
        cd ../eta
    else
        cd eta
    fi
    if [ "$DEV_INSTALL" = true ]; then
        echo "Performing dev install"
        pip install -e .
    else
        echo "Performing install"
        pip install .
    fi
    if [ ! -f eta/config.json ]; then
        echo "Installing default ETA config"
        cp config-example.json eta/config.json
    fi
    cd -
fi

echo "NOTE: You probably want to run:"
echo "  export PYTHONPATH=\$PYTHONPATH:$(pwd)"
echo "***** INSTALLATION COMPLETE *****"
