# FiftyOne Teams Relase Docker Images

This document describes how to build and run a customizable Docker image with a
FiftyOne Teams release of your choice installed.

## Building an image

You can build an image for latest Teams release as follows:

```shell
TOKEN=XXXXXXXXX

docker build \
    --build-arg TOKEN=${TOKEN} \
    -t voxel51/fiftyone-teams .
```

where `TOKEN` is your Teams install token.

The default image uses Ubuntu 20.04 and Python 3.8, but you can customize these
and install a specific Teams release via optional build arguments:

```shell
docker build \
    --build-arg BASE_IMAGE=ubuntu:18.04 \
    --build-arg PYTHON_VERSION=3.9 \
    --build-arg TOKEN=${TOKEN} \
    --build-arg TEAMS_VERSION=0.6.7 \
    -t voxel51/fiftyone-teams:0.6.7 .
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

You'll also need to provide the `FIFTYONE_DATABASE_URI` environment variable to
configure the URI of your centralized database, as well as the appropriate
environment variable(s) to configure your cloud storage credentials.

For example, a typical `docker run` command is:

```shell
SHARED_DIR=/path/to/shared/dir

docker run \
    -e FIFTYONE_DATABASE_URI=mongodb://... \
    -e AWS_CONFIG_FILE=/fiftyone/aws-credentials.ini \
    -v ${SHARED_DIR}:/fiftyone \
    -p 5151:5151 -it voxel51/fiftyone-teams
```

which assumes that you have placed your AWS credentials at
`${SHARED_DIR}/aws-credentials.ini`.

The `-p 5151:5151` option is required so that when you
[launch the App](https://voxel51.com/docs/fiftyone/user_guide/app.html#sessions)
from within the container you can connect to it at http://localhost:5151 in
your browser.

You can provide additional environment variables via the `-e` or `--env-file`
options if you need to further
[configure FiftyOne](https://voxel51.com/docs/fiftyone/user_guide/config.html).

By default, running the image launches an IPython shell, which you can use as
normal:

```py
import fiftyone as fo

dataset = fo.Dataset.from_images_dir("s3://bucket/folder")
session = fo.launch_app(dataset)
```

## Miscellaneous

### Connecting to a localhost database

If you are using a local database that you ordinarily connect to via a URI like
`mongodb://localhost`, then you will need to tweak this slightly when working
in Docker. See [this question](https://stackoverflow.com/q/24319662) for
details.

On Linux, include `--network="host"` in your `docker run` command and use
`mongodb://127.0.0.1` for your URI.

On Mac or Windows, use `mongodb://host.docker.internal` for your URI.
