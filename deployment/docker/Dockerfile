#
# Copyright 2017-2025, Voxel51, Inc.
# voxel51.com
#
# To build a local image, using local source code, run the following from the
#   root of the git clone:
#
# make python
# cp dist/*.whl deployment/docker
# cd package/teams
# make python
# cp dist/*.whl ../../deployment/docker
# cd ../../deployment/docker
# docker buildx build --load -t fiftyone-app:local .
#
# To build a local image, using a published `fiftyone` and `fiftyone-teams-app`,
#  run the following from the root of the git clone:
#
# export GAR_PATH="us-central1-python.pkg.dev/computer-vision-team/dev-python/simple/"
# export PIP_PASS=$(gcloud auth print-access-token)
# export PIP_EXTRA_INDEX_URL="https://oauth2accesstoken:${PIP_PASS}@${GAR_PATH}"
# export SDK_VERION=<version you want to build, no leading `v`>
# docker buildx build --load -f deployment/docker/Dockerfile
#   --secret id=PIP_EXTRA_INDEX_URL \
#   --build-arg BUILD_TYPE=published \
#   --build-arg SDK_VERSION="${SDK_VERSION}" \
#   -t "fiftyone-app:v${SDK_VERSION}-local" .
#
# To publish a `fiftyone-app` image, run the following from the
#   `{repo}/deployment/docker` directory:
#
# export GAR_PATH="us-central1-python.pkg.dev/computer-vision-team/dev-python/simple/"
# export PIP_PASS=$(gcloud auth print-access-token)
# export PIP_EXTRA_INDEX_URL="https://oauth2accesstoken:${PIP_PASS}@${GAR_PATH}"
# export SDK_VERION=<version you want to build, no leading `v`>
# docker buildx build --push \
#   --secret id=PIP_EXTRA_INDEX_URL \
#   --build-arg BUILD_TYPE=published \
#   --build-arg SDK_VERSION="${SDK_VERSION}" \
#   -t "${TEAMS_IMAGE_NAME}" .
#
# To publish a `fiftyone-app-internal` image, run the following from the
#   `{repo}/deployment/docker` directory AFTER you have built the
#   `fiftyone-teams-cv-full` image
#
# export GAR_PATH="us-central1-python.pkg.dev/computer-vision-team/dev-python/simple/"
# export PIP_PASS=$(gcloud auth print-access-token)
# export PIP_EXTRA_INDEX_URL="https://oauth2accesstoken:${PIP_PASS}@${GAR_PATH}"
# export SDK_VERION=<version you want to build, no leading `v`>
# docker buildx build --push \
#   --secret id=PIP_EXTRA_INDEX_URL \
#   --build-arg BUILD_TYPE=published \
#   --build-arg CV_BASE_IMAGE_NAME="${CV_BASE_IMAGE_NAME}" \
#   --build-arg SDK_VERSION="${SDK_VERSION}"
#   -t "${INTERNAL_IMAGE_NAME}" --target internalrelease .

ARG BUILD_TYPE=local
ARG CV_BASE_IMAGE_NAME=fiftyone-teams-cv-full:local
ARG PIP_INDEX_URL="https://pypi.org/simple"
ARG PYTHON_VERSION=3.11


#### Build using local dependencies
FROM python:${PYTHON_VERSION} AS local
ARG PIP_INDEX_URL

COPY ./*.whl .
RUN pip --no-cache-dir install -q -U pip setuptools wheel \
    && pip wheel --wheel-dir=/tmp/wheels ./*.whl umap-learn

#### Build using published dependencies
FROM python:${PYTHON_VERSION} AS published
ARG PIP_INDEX_URL
ARG SDK_VERSION

RUN --mount=type=secret,id=PIP_EXTRA_INDEX_URL \
    export PIP_EXTRA_INDEX_URL=$(cat /run/secrets/PIP_EXTRA_INDEX_URL) \
    && pip --no-cache-dir install -q -U pip setuptools wheel \
    && pip wheel --wheel-dir=/tmp/wheels \
         fiftyone==${SDK_VERSION} \
         fiftyone-teams-app==${SDK_VERSION} \
         umap-learn

#### We need a common alias because `--mount=from` won't take a variable
FROM ${BUILD_TYPE} AS builder

### Internal Plugins Image
FROM builder AS internal-wheelhouse
ARG PIP_INDEX_URL

# See Dockerfile-gpt about these dependenencies.
RUN pip wheel --wheel-dir=/tmp/wheels \
      "httpx==0.27.2" \
      "langchain-community==0.3.5" \
      "langchain-core==0.3.15" \
      "langchain-openai==0.2.6" \
      "langchain==0.3.7" \
      "openai==1.54.3" \
      "psycopg[binary]" \
      "pydantic>=2.0,<2.11" \
      "tiktoken>=0.7.0" \
      albumentations \
      darwin-fiftyone \
      databricks-sdk \
      databricks-vectorsearch \
      google-cloud-bigquery \
      pandas \
      pyperclip \
      scipy \
      sentence_transformers \
      /tmp/wheels/fiftyone-*.whl


FROM ${CV_BASE_IMAGE_NAME} AS internalrelease

RUN --mount=type=cache,from=internal-wheelhouse,target=/wheelhouse,ro \
    pip --no-cache-dir install -q --no-index \
      --find-links=/wheelhouse/tmp/wheels \
      "httpx==0.27.2" \
      "langchain-community==0.3.5" \
      "langchain-core==0.3.15" \
      "langchain-openai==0.2.6" \
      "langchain==0.3.7" \
      "openai==1.54.3" \
      "psycopg[binary]" \
      "pydantic>=2.0,<2.11" \
      "tiktoken>=0.7.0" \
      albumentations \
      darwin-fiftyone \
      databricks-sdk \
      databricks-vectorsearch \
      google-cloud-bigquery \
      pandas \
      pyperclip \
      scipy \
      sentence_transformers \
      /wheelhouse/tmp/wheels/fiftyone-*.whl


### `fiftyone-app` image - last to make it the default
FROM python:${PYTHON_VERSION}-slim AS release

WORKDIR /opt

COPY entrypoint.sh entrypoint.sh

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
    && "${VIRTUAL_ENV}"/bin/pip --no-cache-dir install -q -U pip setuptools wheel \
    && rm -rf /usr/local/lib/python*/ensurepip \
    && chmod +x /opt/entrypoint.sh

# Install fiftyone-teams-app and chown everything to voxel51
RUN --mount=type=cache,from=builder,target=/builder,ro \
    pip --no-cache-dir install -q -U pip setuptools wheel \
    && pip --no-cache-dir install -q --pre --no-index \
    --find-links=/builder/tmp/wheels \
    fiftyone-teams-app \
    umap-learn \
    && mkdir -p /opt/plugins \
    && chown --silent --no-dereference --recursive voxel51:voxel51 /opt

# run as the voxel51 user
USER 1000:1000

#
# Serve the app. Kept as a CMD and not an
# ENTRYPOINT so existing customers not impacted
# if they override these
#
CMD [ "/opt/entrypoint.sh" ]
