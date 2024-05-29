#
# Copyright 2017-2024, Voxel51, Inc.
# voxel51.com
#
# To build a local image, run the following from the root of the git clone:
#
# docker buildx build --load -f deployment/docker/Dockerfile \
#   -t fiftyone-app:local .
#
# To publish a `fiftyone-app` image, run the following from the
#   `{repo}/deployment/docker` directory:
#
#  docker buildx build --push -t ${TEAMS_IMAGE_NAME} .
#
# To publish a `fiftyone-app-internal` image, run the following from the
#   `{repo}/deployment/docker` directory AFTER you have built the GPT image
#
#  export PIP_USER=oauth2accesstoken
#  export PIP_PASS=$(gcloud auth print-access-token)
#  export GAR_PATH="us-central1-python.pkg.dev/computer-vision-team/dev-python/simple/
#  export PIP_EXTRA_INDEX_URL="https://${PIP_USER}:${PIP_PASS}@${GAR_PATH}"
#  docker buildx build --push \
#    --secret id=PIP_EXTRA_INDEX_URL \
#    --build-arg GPT_PLUGIN_IMAGE="${GPT_IMAGE_NAME}" \
#    --build-arg SDK_VERSION="${SDK_VERSION}" \
#    -t "${INTERNAL_IMAGE_NAME}" --target internalrelease .


ARG PYTHON_VERSION=3.10
ARG GPT_PLUGIN_IMAGE_NAME=fiftyone-app-gpt:local

FROM python:${PYTHON_VERSION} as builder
ARG PIP_INDEX_URL=https://pypi.org/simple

COPY ./*.whl .
COPY ./yarnrc.yml ~/.yarnrc.yml

RUN pip --no-cache-dir install -q -U pip setuptools wheel \
    && pip wheel --wheel-dir=/tmp/wheels ./*.whl

### Internal Plugins Image
FROM builder as internal-wheelhouse
ARG PIP_INDEX_URL=https://pypi.org/simple
ARG SDK_VERSION

RUN --mount=type=secret,id=PIP_EXTRA_INDEX_URL \
    export PIP_EXTRA_INDEX_URL=$(cat /run/secrets/PIP_EXTRA_INDEX_URL) \
    && pip wheel --wheel-dir=/tmp/wheels \
    darwin-fiftyone \
    fiftyone=="${SDK_VERSION}" \
    pyperclip \
    sentence_transformers


FROM ${GPT_PLUGIN_IMAGE_NAME} as internalrelease

RUN --mount=type=cache,from=internal-wheelhouse,target=/wheelhouse,ro \
    pip --no-cache-dir install -q --no-index \
    --find-links=/wheelhouse/tmp/wheels \
    sentence_transformers \
    pyperclip \
    darwin-fiftyone


### `fiftyone-app` image - last to make it the default
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
    && apt-get -qq install -y --no-install-recommends ffmpeg \
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
    && pip --no-cache-dir install -q --pre --no-index --find-links=/builder/tmp/wheels fiftyone-teams-app \
    && mkdir -p /opt/plugins \
    && chown --silent --no-dereference --recursive voxel51:voxel51 /opt

# run as the voxel51 user
USER 1000:1000

#
# Serve the app
#
CMD hypercorn fiftyone.teams.app:app --bind "${FIFTYONE_DEFAULT_APP_ADDRESS:-0.0.0.0}":"${FIFTYONE_DEFAULT_APP_PORT:-5151}"
