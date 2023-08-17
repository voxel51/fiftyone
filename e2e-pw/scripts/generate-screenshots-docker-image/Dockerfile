FROM mcr.microsoft.com/playwright:v1.37.1-jammy

# Install python 3.10
RUN apt-get update \
    && apt-get install -y python3.10 python3-pip python3.10-venv \
    && ln -s /usr/bin/python3 /usr/bin/python

WORKDIR /e2e

COPY .build /e2e/fiftyone

RUN python -m venv /e2e/venv \
    && . /e2e/venv/bin/activate \
    && cd /e2e/fiftyone \
    && pip install -r requirements/github.txt \
    && pip install -e .

ENV IS_UTILITY_DOCKER=true
ENV FIFTYONE_ROOT_DIR=/e2e/fiftyone
ENV FIFTYONE_DATABASE_ADMIN=true
ENV FIFTYONE_DATABASE_URI=mongodb://host.docker.internal:27017/
