# FiftyOne Teams App Docker Images

This document describes how to build and run a customizable Docker image with a
FiftyOne Teams App release of your choice installed.

## Building an image

You can build an image for latest Teams App release as follows:

```shell
TOKEN=XXXXXXXXX

docker build \
    --build-arg TOKEN=${TOKEN} \
    -t voxel51/fiftyone-teams-app .
```

where `TOKEN` is your Teams install token.

The default image uses Ubuntu 20.04 and Python 3.9, but you can customize these
and install a specific Teams release via optional build arguments.

```shell
docker build \
    --build-arg BASE_IMAGE=ubuntu:18.04 \
    --build-arg PYTHON_VERSION=3.9 \
    --build-arg TOKEN=${TOKEN} \
    -t voxel51/fiftyone-teams-app .
```

Refer to the `Dockerfile` itself for additional Python packages that you may
wish to include in your build.

## Running an image

The image is designed to persist any local data in a single `/fiftyone`
directory with the following organization:

```
/fiftyone/
    cache/          # FIFTYONE_MEDIA_CACHE_DIR
    db/             # FIFTYONE_DATABASE_DIR
    default/        # FIFTYONE_DEFAULT_DATASET_DIR
    zoo/
        datasets/   # FIFTYONE_DATASET_ZOO_DIR
        models/     # FIFTYONE_MODEL_ZOO_DIR
```

Therefore, to run a container, you should mount `/fiftyone` as a local volume
via `--mount` or `-v`, as shown below.

You'll also need to provide the `FIFTYONE_DATABASE_URI` and
`FIFTYONE_TEAMS_ORGANIZATION` environment variables to configure the URI of
your centralized database and your organization's authentication key, as well
as the appropriate environment variable(s) to configure your cloud storage
credentials.

For example, a typical `docker run` command is:

```shell
SHARED_DIR=/path/to/shared/dir

docker run \
    -e FIFTYONE_DATABASE_URI=mongodb://... \
    -e FIFTYONE_TEAMS_ORGANIZATION=... \
    -e AWS_CONFIG_FILE=/fiftyone/aws-credentials.ini \
    -v ${SHARED_DIR}:/fiftyone \
    -p 5151:5151 -it voxel51/fiftyone-teams-app
```

which assumes that you have placed your AWS credentials at
`${SHARED_DIR}/aws-credentials.ini`.

The app is exposed on port 5151 by default. An arbitrary amount of these app
services can be put behind a netwowrk configuration e.g. a load balancer.
