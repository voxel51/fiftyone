FROM ubuntu:20.04

ARG DEBIAN_FRONTEND=noninteractive

RUN apt -y update
RUN apt -y upgrade
RUN apt install -y \
    libcurl4 \
    build-essential \
    unzip \
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
    python3 \
    python-dev \
    python3-dev \
    python3-pip \
    python3-venv \
    ffmpeg

COPY dist dist

RUN pip install -U pip setuptools wheel notebook
RUN pip install dist/*.whl
RUN rm -rf dist

CMD  python /usr/local/lib/python3.9/site-packages/fiftyone/server/main.py --port 5151
