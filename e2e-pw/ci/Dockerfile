# Prebaked environment for the e2e CI shards (.github/workflows/e2e.yml).
# Rebuilt by .github/workflows/build-e2e-image.yml on develop pushes that
# touch the Python dependency tree or the Playwright lockfile.
#
# The image bakes everything a shard job used to install at runtime:
# Python 3.10 + fiftyone's third-party dependency tree, Node 22 + Yarn 4,
# ffmpeg, and the Chromium build matching e2e-pw's Playwright version.
# The shard job only installs fiftyone itself from the PR's source and
# e2e-pw's node_modules (restored from cache).

FROM python:3.10.16-slim-bookworm

ENV DEBIAN_FRONTEND=noninteractive \
    PLAYWRIGHT_BROWSERS_PATH=/ms-playwright

RUN apt-get update \
    && apt-get install -y --no-install-recommends ca-certificates curl git tar \
    && curl -fsSL https://deb.nodesource.com/setup_22.x | bash - \
    && apt-get install -y --no-install-recommends nodejs ffmpeg \
    && rm -rf /var/lib/apt/lists/* \
    && corepack enable \
    && corepack prepare yarn@4.9.1 --activate

COPY --from=ghcr.io/astral-sh/uv:latest /uv /uvx /usr/local/bin/

# Bake fiftyone's dependency tree exactly as setup.py resolves it, then drop
# fiftyone itself — the shard job reinstalls it from the PR's source, which
# is fast once the dependencies are already present.
COPY . /tmp/fiftyone-src
RUN uv pip install --system '/tmp/fiftyone-src[multimodal]' \
        -r /tmp/fiftyone-src/requirements/e2e.txt \
    && uv pip uninstall --system fiftyone \
    && rm -rf /tmp/fiftyone-src

# Bake the Chromium build matching e2e-pw's Playwright lockfile.
COPY e2e-pw/package.json e2e-pw/yarn.lock e2e-pw/.yarnrc.yml /tmp/e2e-pw/
RUN cd /tmp/e2e-pw \
    && yarn install \
    && yarn playwright install --with-deps chromium \
    && rm -rf /tmp/e2e-pw
