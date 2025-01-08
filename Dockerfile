# Copyright 2017-2025, Voxel51, Inc.
# voxel51.com
#
# Dockerfile for building an image with source FiftyOne atop a Python 3.11
#  base image
#
# ARGs::
#
#   PIP_INDEX_URL (https://pypi.org/simple): Allow the use of caching proxies
#   PYTHON_VERSION (3.11): The Python base image to use
#   ROOT_DIR (/fiftyone): The name of the directory within the container that
#       should be mounted when running
#
# Example usage::
#
#   # Build
#   make docker
#
#   # Run
#   SHARED_DIR=/path/to/shared/dir
#   docker run \
#       -v ${SHARED_DIR}:/fiftyone \
#       -p 5151:5151 \
#       -it local/fiftyone
#

# The base python image to build from
ARG PYTHON_VERSION=3.11

# Collect wheels for future installation
FROM python:${PYTHON_VERSION} AS builder
ARG PIP_INDEX_URL=https://pypi.org/simple

COPY dist dist

RUN pip --no-cache-dir install -q -U pip setuptools wheel \
    && pip wheel --wheel-dir=/wheels \
        dist/*.whl \
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


# Create a smaller image with wheels installed
FROM python:${PYTHON_VERSION}-slim AS final
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

#
# Default, interactive, behavior
#

CMD [ "ipython" ]

# Use this if want the default behavior to launch the App instead
# EXPOSE 5151
# CMD [ \
#     "python", \
#     ".fiftyone-venv/lib/python3.11/site-packages/fiftyone/server/main.py", \
#     "--port", \
#     "5151" \
#     ]
