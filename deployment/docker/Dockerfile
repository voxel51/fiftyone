# Dockerfile for building an image with a FiftyOne Team App release atop a
# Debian-based Linux distribution.
#
# OPTIONAL BUILD ARGs::
#
#   PYTHON_VERSION (3.10): The Python version to install. Must be >= 3.9
#
# REQUIRED RUNTIME ENV VARS::
#
#   FIFTYONE_DATABASE_URI: your MongoDB database URI
#   FIFTYONE_TEAMS_CLIENT_ID: your application client ID
#   FIFTYONE_TEAMS_ORGANIZATION: your organization's authentication ID
#
# OPTIONAL RUNTIME ENV VARS::
#
#   (your cloud storage credentials)
#
# Example usage::
#
#   # Build
#   DOCKER_BUILDKIT=1 docker build \
#       --build-arg TOKEN=${TOKEN} \
#       -t voxel51/fiftyone-teams-app .
#
#   # Run
#   SHARED_DIR=/data # if necessary
#   docker run \
#       -e FIFTYONE_DATABASE_URI=mongodb://... \
#       -e FIFTYONE_TEAMS_CLIENT_ID=... \
#       -e FIFTYONE_TEAMS_ORGANIZATION=... \
#       -e AWS_CONFIG_FILE=/fiftyone/aws-credentials.ini \
#       -v /path/to/aws-credentials.ini:/fiftyone/aws-credentials.ini \
#       -p 5151:5151 \
#       -it voxel51/fiftyone-teams-app
#
# Copyright 2017-2023, Voxel51, Inc.
# voxel51.com
#

ARG PYTHON_VERSION=3.10

FROM python:${PYTHON_VERSION} as builder
ARG PIP_INDEX_URL=https://pypi.org/simple

COPY ./*.whl .
COPY ./yarnrc.yml ~/.yarnrc.yml

RUN pip --no-cache-dir install -q -U pip setuptools wheel \
    && pip wheel --wheel-dir=/tmp/wheels ./*.whl ffmpeg


FROM python:${PYTHON_VERSION}-slim as release

WORKDIR /opt

ENV FIFTYONE_DATABASE_ADMIN=false \
    FIFTYONE_DATABASE_NAME=fiftyone \
    FIFTYONE_MEDIA_CACHE_APP_IMAGES=false \
    FIFTYONE_MEDIA_CACHE_SIZE_BYTES=-1 \
    TZ=Etc/UTC \
    VIRTUAL_ENV=/opt/fiftyone-teams-app
ENV PATH="${VIRTUAL_ENV}/bin:${PATH}"

# Update the base image, install ffmpeg, create the voxel51 user
RUN apt-get -qq -y update && apt-get -qq -y upgrade \
    && apt clean && rm -rf /var/lib/apt/lists/* \
    # addresses CVE-2022-40897
    && /usr/local/bin/pip install -U pip setuptools \
    && groupadd -g 1000 voxel51 \
    && useradd -u 1000 -g 1000 -l -d /opt voxel51 \
    && python3 -m venv "${VIRTUAL_ENV}" \
    && "${VIRTUAL_ENV}"/bin/pip --no-cache-dir install -q -U pip setuptools wheel

# Install fiftyone-teams-app and chown everything to voxel51
RUN --mount=type=cache,from=builder,target=/builder,ro \
    pip --no-cache-dir install -q -U pip setuptools wheel \
    && pip --no-cache-dir install -q --pre --no-index --find-links=/builder/tmp/wheels fiftyone-teams-app ffmpeg \
    && mkdir -p /opt/plugins \
    && chown --silent --no-dereference --recursive voxel51:voxel51 /opt

# run as the voxel51 user
USER 1000:1000

#
# Serve the app
#
CMD hypercorn fiftyone.teams.app:app --bind "${FIFTYONE_DEFAULT_APP_ADDRESS:-0.0.0.0}":"${FIFTYONE_DEFAULT_APP_PORT:-5151}"
