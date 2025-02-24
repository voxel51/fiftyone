# Copyright 2017-2025, Voxel51, Inc.
# voxel51.com
#
# Dockerfile for building a FiftyOne image atop a Python base image as defined
#  by the PYTHON_VERSION build-arg
#
# ARGs::
#
#   BUILD_TYPE (source): Allows source or released artifact builds without
#       editing the Dockerfile [`source` or `released`]
#   FO_VERSION [`released` builds only]: This is the fiftyone version to use for
#       `released` builds
#   PIP_INDEX_URL (https://pypi.org/simple): Allow the use of caching proxies
#   PYTHON_VERSION (3.11): The Python base image to use
#   ROOT_DIR (/fiftyone): The name of the directory within the container that
#       should be mounted when running
#
# Targets::
#   interactive (default): This builds a docker image that runs `ipython`
#   server: This builds a docker image that launches fiftyone on port 5151
#
# Example usage::
#
#   # Build interactive image from source
#   make docker
#
#   # Build interactive image from released artifact
#   docker build -t local/fiftyone \
#      --build-arg BUILD_TYPE=released \
#      --build-arg FO_VERSION=1.3.0 .
#
#   # Build server image from source artifact
#   make python
#   docker build -t local/fiftyone --target server .
#
#   # Run
#   SHARED_DIR=/path/to/shared/dir
#   docker run \
#       -v ${SHARED_DIR}:/fiftyone \
#       -p 5151:5151 \
#       -it local/fiftyone
#

# The type of build to run
ARG BUILD_TYPE=source

# The base python image to build from
ARG PYTHON_VERSION=3.11

# Collect wheels for future installation
FROM python:${PYTHON_VERSION} AS source
ARG PIP_INDEX_URL=https://pypi.org/simple
# default: use local wheel
#
COPY dist dist

RUN pip --no-cache-dir install -q -U pip setuptools wheel \
    && pip wheel --wheel-dir=/wheels \
        dist/*.whl \
        ipython

FROM python:${PYTHON_VERSION} AS released
ARG PIP_INDEX_URL=https://pypi.org/simple
# server: use published pypi package
#
ARG FO_VERSION
ENV FO_VERSION=${FO_VERSION}
RUN pip --no-cache-dir install -q -U pip setuptools wheel \
    && pip wheel --wheel-dir=/wheels \
        fiftyone==${FO_VERSION} \
        ipython

#
# Other packages you might want to add to the list above:
#   torch torchvision: Torch model training/zoo datasets
#   tensorflow tensorflow-datasets: TF model training/zoo datasets
#   pycocotools: COCO-style evaluation
#   notebook>=5.3 ipywidgets>=7.5: Jupyter notebooks
#   flash>=0.4: Lightning Flash integration
#   apache_beam: Apache Beam integration
#   labelbox: Labelbox integration
#   shapely: Polyline evaluation
#   rasterio: GeoTIFF images
#   pydicom: DICOM images
#

FROM ${BUILD_TYPE} AS builder
# This is an empty target because you can't use a variable in `RUN --mount`


# Create a smaller image with wheels installed
FROM python:${PYTHON_VERSION}-slim AS shared
ARG PIP_INDEX_URL=https://pypi.org/simple

# The name of the shared directory in the container that should be
# volume-mounted by users to persist data loaded into FiftyOne
ARG ROOT_DIR=/fiftyone

WORKDIR /opt

ENV FIFTYONE_DATABASE_DIR=${ROOT_DIR}/db \
    FIFTYONE_DEFAULT_APP_ADDRESS='0.0.0.0' \
    FIFTYONE_DEFAULT_DATASET_DIR=${ROOT_DIR}/default \
    FIFTYONE_DATASET_ZOO_DIR=${ROOT_DIR}/zoo/datasets \
    FIFTYONE_MODEL_ZOO_DIR=${ROOT_DIR}/zoo/models \
    VIRTUAL_ENV=/opt/.fiftyone-venv
ENV PATH="${VIRTUAL_ENV}/bin:${PATH}"

# Update the base image and install ffmpeg
RUN apt-get -qq -y update && apt-get -qq -y upgrade \
    && apt-get -qq install -y --no-install-recommends ffmpeg libcurl4 php-curl \
    && apt clean && rm -rf /var/lib/apt/lists/*

# Create Virtual Env
RUN python -m venv "${VIRTUAL_ENV}"

# Install wheels from builder stage
RUN --mount=type=cache,from=builder,target=/builder,ro \
    pip --no-cache-dir install -q -U pip setuptools wheel \
    && pip --no-cache-dir install -q --pre --no-index \
    --find-links=/builder/wheels \
    /builder/wheels/*

FROM shared AS server
#
# server: Launch the App
#
EXPOSE 5151
CMD [ \
    "python", \
    "-m", \
    "fiftyone.server.main", \
    "--port", \
    "5151" \
    ]

FROM shared AS interactive
#
# default: interactive, behavior
#
CMD [ "ipython" ]
