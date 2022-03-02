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
#   docker build -t voxel51/fiftyone-teams-deployment .
#
#   # Run
#   SHARED_DIR=/path/to/shared/dir
#   docker run \
#       -v ${SHARED_DIR}:/fiftyone \
#       -p 5151:5151 \
#       -it voxel51/fiftyone-teams
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

ENV FIFTYONE_TEAMS_APP_PORT=5151

EXPOSE $FIFTYONE_TEAMS_APP_PORT

CMD hypercorn fiftyone.teams.app:app --bind localhost:${FIFTYONE_TEAMS_APP_PORT}
