# Prebaked environment for the Python unit-test jobs (.github/workflows/test.yml).
# Rebuilt by .github/workflows/build-ci-images.yml on develop pushes that
# touch the Python dependency tree; core and full images are built for every
# Python minor version.
#
# The core profile bakes the locked core-test dependency tree; the full profile
# additionally includes ML and cloud dependencies. Both profiles include
# ffmpeg. libcurl4 is required by the bundled mongod that fiftyone-db starts
# during tests. The test job only installs fiftyone itself from the PR's
# source.

ARG PYTHON_VERSION=3.10
FROM python:${PYTHON_VERSION}-slim-bookworm
ARG TEST_PROFILE=full

ENV DEBIAN_FRONTEND=noninteractive \
    UV_PROJECT_ENVIRONMENT=/opt/fiftyone-venv \
    PATH="/opt/fiftyone-venv/bin:${PATH}"

RUN apt-get update \
    && apt-get install -y --no-install-recommends \
        ca-certificates curl git ffmpeg libcurl4 \
    && rm -rf /var/lib/apt/lists/*

COPY --from=ghcr.io/astral-sh/uv:0.11.32@sha256:df4cae8f3a96d175e2e5f992e597550000edbe78fdc2594d5cd8de1a217f504c \
    /uv /uvx /usr/local/bin/

# Bake the locked dependency tree without the project itself. The test job
# syncs the PR checkout into the same stable environment.
COPY . /tmp/fiftyone-src
RUN cd /tmp/fiftyone-src \
    && case "$TEST_PROFILE" in \
        core) test_group=test-core ;; \
        full) test_group=test ;; \
        *) echo "Unsupported test profile: $TEST_PROFILE" >&2; exit 1 ;; \
    esac \
    && uv sync --locked --no-default-groups --no-install-project \
        --extra multimodal --group "$test_group" \
    && rm -rf /tmp/fiftyone-src
