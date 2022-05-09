# Dockerfile for building an image with a source FiftyOne Teams install atop a
# Debian-based Linux distribution.
#
# By default, Ubuntu 20.04 and Python 3.8 are used, but these can be customized
# via ARGs.
#
# ARGs::
#
#   BASE_IMAGE (voxel51/fiftyone-teams): The FiftyOne Teams image to build from
#   PYTHON_VERSION (3.8): The Python version to install
#   ROOT_DIR (/fiftyone): The name of the directory within the container that
#       should be mounted when running
#
# Example usage::
#
#   # Build
#   make python
#   docker build -t voxel51/fiftyone-teams-app .
#
#   # Run
#   SHARED_DIR=/path/to/shared/dir
#   docker run \
#       -e FIFTYONE_DATABASE_URI=mongodb://... \
#       -e FIFTYONE_TEAMS_ORGANIZATION=PROVIDED_ORG_ID
#       -e AWS_CONFIG_FILE=/fiftyone/aws-credentials.ini \
#       -v ${SHARED_DIR}:/fiftyone \
#       -p 5151:5151 \
#       -it voxel51/fiftyone-teams-app
#
# Copyright 2017-2022, Voxel51, Inc.
# voxel51.com
#

# The base image to build from
ARG BASE_IMAGE=voxel51/fiftyone-teams
FROM $BASE_IMAGE

#
# Install from source
#
COPY dist dist
RUN pip --no-cache-dir install dist/*.whl && rm -rf dist


CMD hypercorn fiftyone.teams.app:app --bind 0.0.0.0:5151
