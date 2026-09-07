# Prebaked environment for the Python unit-test jobs (.github/workflows/test.yml).
# Rebuilt by .github/workflows/build-ci-images.yml on develop pushes that
# touch the Python dependency tree; one image per Python minor version.
#
# The image bakes everything a test job used to install at runtime: the
# fiftyone dependency tree (including torch/tensorflow from
# requirements/github.txt) and ffmpeg. libcurl4 is required by the bundled
# mongod that fiftyone-db starts during tests; gnupg by the codecov
# uploader's signature check. The test job only installs fiftyone itself
# from the PR's source.

ARG PYTHON_VERSION=3.10
FROM python:${PYTHON_VERSION}-slim-bookworm

ENV DEBIAN_FRONTEND=noninteractive

RUN apt-get update \
    && apt-get install -y --no-install-recommends \
        ca-certificates curl git gnupg ffmpeg libcurl4 \
    && rm -rf /var/lib/apt/lists/*

COPY --from=ghcr.io/astral-sh/uv:latest /uv /uvx /usr/local/bin/

# Bake fiftyone's dependency tree exactly as pyproject.toml resolves it, then drop
# fiftyone itself — the test job reinstalls it from the PR's source, which
# is fast once the dependencies are already present.
COPY . /tmp/fiftyone-src
RUN uv pip install --system -U wheel setuptools \
    && uv pip install --system '/tmp/fiftyone-src[multimodal]' \
        -r /tmp/fiftyone-src/requirements/github.txt \
    && uv pip uninstall --system fiftyone \
    && rm -rf /tmp/fiftyone-src
