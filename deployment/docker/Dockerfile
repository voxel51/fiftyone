# Dockerfile for building an image with a FiftyOne Team App release atop a
# Debian-based Linux distribution.
#
# THIS IS ONLY FOR DEV BUILDS - see https://github.com/voxel51/fiftyone-teams-app-deploy
#  for versions of this Dockerfile designed for general use
#
# REQUIRED BUILD ARGs::
#
#   GAR_TOKEN: Your Google Artifact Registry OAuth2 token
#   FIFTYONE_VERSION: The version of `fiftyone` to install
#   TEAMS_APP_VERSION: The version of `fiftyone-teams-app` to install
#
# OPTIONAL BUILD ARGs::
#
#   BASE_IMAGE (ubuntu:20.04): The Debian-based image to build from
#   PYTHON_VERSION (3.9): The Python version to install. Must be >= 3.9
#   ROOT_DIR (/fiftyone): The name of the directory within the container that
#       should be mounted when running
#
# REQUIRED RUNTIME ENV VARS::
#
#   FIFTYONE_DATABASE_URI: your MongoDB database URI
#   FIFTYONE_TEAMS_CLIENT_ID: your application client ID
#   FIFTYONE_TEAMS_ORGANIZATION: your organization's authentication ID
#   (your cloud storage credentials)
#
# Example usage::
#
#   # Build
#   docker build \
#       --build-arg GAR_TOKEN=${TOKEN} \
#       --build-arg FIFTYONE_VERSION=${FIFTYONE_VERSION} \
#       --build-arg TEAMS_APP_VERSION=${TEAMS_APP_VERSION} \
#       -t voxel51/fiftyone-teams-app:${TEAMS_APP_VERSION} .
#
#   # Run
#   SHARED_DIR=/data # if necessary
#   docker run \
#       -e FIFTYONE_DATABASE_URI=mongodb://... \
#       -e FIFTYONE_TEAMS_CLIENT_ID=... \
#       -e FIFTYONE_TEAMS_ORGANIZATION=... \
#       -e AWS_CONFIG_FILE=/fiftyone/aws-credentials.ini \
#       -v ${SHARED_DIR}:/fiftyone \
#       -p 5151:5151 \
#       -it voxel51/fiftyone-teams-app
#
# Copyright 2017-2022, Voxel51, Inc.
# voxel51.com
#

# The base image to build from; must be Debian-based (eg Ubuntu)
ARG BASE_IMAGE=ubuntu:20.04
FROM $BASE_IMAGE

# The Python version to install. Must be >= 3.9
ARG PYTHON_VERSION=3.9

#
# Install system packages
#

RUN apt -y update \
    && apt -y --no-install-recommends install software-properties-common \
    && add-apt-repository -y ppa:deadsnakes/ppa \
    && apt -y update \
    && apt -y upgrade \
    && apt -y --no-install-recommends install tzdata \
    && TZ=Etc/UTC \
    && apt -y --no-install-recommends install \
        build-essential \
        ca-certificates \
        cmake \
        cmake-data \
        pkg-config \
        libcurl4 \
        libsm6 \
        libxext6 \
        libssl-dev \
        libffi-dev \
        libxml2-dev \
        libxslt1-dev \
        zlib1g-dev \
        unzip \
        curl \
        wget \
        python${PYTHON_VERSION} \
        python${PYTHON_VERSION}-dev \
        python${PYTHON_VERSION}-distutils \
        ffmpeg \
    && ln -s /usr/bin/python${PYTHON_VERSION} /usr/local/bin/python \
    && ln -s /usr/local/lib/python${PYTHON_VERSION} /usr/local/lib/python \
    && curl https://bootstrap.pypa.io/get-pip.py | python \
    && rm -rf /var/lib/apt/lists/*

RUN pip --no-cache-dir install --upgrade pip setuptools wheel ipython

#
# Install FiftyOne Teams
#

# Your install token
ARG GAR_TOKEN

# The Teams App version to install
ARG TEAMS_APP_VERSION

# The FiftyOne version to install
ARG FIFTYONE_VERSION

# The GAR Repo to use
ARG GAR_REPO=us-central1-python.pkg.dev/computer-vision-team/dev-python/simple

RUN pip --no-cache-dir install \
    --extra-index-url https://oauth2accesstoken:${GAR_TOKEN}@${GAR_REPO} \
    fiftyone-teams-app==${TEAMS_APP_VERSION} fiftyone==${FIFTYONE_VERSION}

#
# Configure shared storage
#

ENV FIFTYONE_MEDIA_CACHE_SIZE_BYTES=-1 \
    FIFTYONE_MEDIA_CACHE_APP_IMAGES=false \
    FIFTYONE_DATABASE_ADMIN=true \
    FIFTYONE_DATABASE_NAME=fiftyone

#
# Serve the app
#

CMD hypercorn fiftyone.teams.app:app --bind "${FIFTYONE_DEFAULT_APP_ADDRESS:-0.0.0.0}":"${FIFTYONE_DEFAULT_APP_PORT:-5151}"
