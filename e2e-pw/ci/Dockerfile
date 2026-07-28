# Prebaked environment for the e2e CI shards (.github/workflows/e2e.yml).
# Rebuilt by .github/workflows/build-ci-images.yml on develop pushes that
# touch the Python dependency tree or the Playwright lockfile.
#
# The image bakes everything a shard job used to install at runtime:
# Python 3.10 + fiftyone's third-party dependency tree, Node 22 + Yarn 4,
# ffmpeg, and the Chromium build matching e2e-pw's Playwright version.
# The shard job only installs fiftyone itself from the PR's source and
# e2e-pw's node_modules (restored from cache).

FROM python:3.10.16-slim-bookworm

ENV DEBIAN_FRONTEND=noninteractive \
    PLAYWRIGHT_BROWSERS_PATH=/ms-playwright \
    UV_PROJECT_ENVIRONMENT=/opt/fiftyone-venv \
    PATH="/opt/fiftyone-venv/bin:${PATH}"

# procps: tree-kill shells out to `ps` to kill FiftyOne server process trees
RUN apt-get update \
    && apt-get install -y --no-install-recommends ca-certificates curl git tar procps \
    && curl -fsSL https://deb.nodesource.com/setup_22.x | bash - \
    && apt-get install -y --no-install-recommends nodejs ffmpeg \
    && rm -rf /var/lib/apt/lists/* \
    && corepack enable \
    && corepack prepare yarn@4.9.1 --activate

COPY --from=ghcr.io/astral-sh/uv:0.11.32@sha256:df4cae8f3a96d175e2e5f992e597550000edbe78fdc2594d5cd8de1a217f504c \
    /uv /uvx /usr/local/bin/

# Bake the locked dependency tree without the project itself. The shard job
# syncs the PR checkout into the same stable environment.
COPY . /tmp/fiftyone-src
RUN cd /tmp/fiftyone-src \
    && uv sync --locked --no-default-groups --no-install-project \
        --extra multimodal --group e2e \
    && rm -rf /tmp/fiftyone-src

# Bake the Chromium build matching e2e-pw's Playwright lockfile.
COPY e2e-pw/package.json e2e-pw/yarn.lock e2e-pw/.yarnrc.yml /tmp/e2e-pw/
RUN cd /tmp/e2e-pw \
    && yarn install \
    && yarn playwright install --with-deps chromium \
    && rm -rf /tmp/e2e-pw
