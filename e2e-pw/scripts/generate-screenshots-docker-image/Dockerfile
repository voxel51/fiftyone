FROM mcr.microsoft.com/playwright:v1.50.1

# Install Python 3.10 via deadsnakes PPA
RUN apt-get update && apt-get install -y software-properties-common \
    && add-apt-repository ppa:deadsnakes/ppa -y \
    && apt-get update \
    && apt-get install -y libhdf5-dev pkg-config ffmpeg \
       python3.10 python3.10-venv python3.10-distutils \
    && ln -sf /usr/bin/python3.10 /usr/bin/python \
    && ln -sf /usr/bin/python3.10 /usr/bin/python3 \
    && python -m ensurepip --upgrade

WORKDIR /e2e

COPY .build /e2e/fiftyone
COPY --from=ghcr.io/astral-sh/uv:0.11.32@sha256:df4cae8f3a96d175e2e5f992e597550000edbe78fdc2594d5cd8de1a217f504c \
    /uv /uvx /usr/local/bin/

ENV UV_PROJECT_ENVIRONMENT=/e2e/venv
ENV PATH="/e2e/venv/bin:${PATH}"

RUN cd /e2e/fiftyone \
    && uv sync --locked --no-default-groups \
        --extra multimodal --group e2e

ENV IS_UTILITY_DOCKER=true
ENV FIFTYONE_ROOT_DIR=/e2e/fiftyone
ENV FIFTYONE_DATABASE_ADMIN=true
ENV FIFTYONE_DATABASE_URI=mongodb://host.docker.internal:27017/
ENV PYTHONPATH=/e2e/fiftyone
