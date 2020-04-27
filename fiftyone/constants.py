"""
FiftyOne package-wide constants.

| Copyright 2017-2020, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""
# pragma pylint: disable=redefined-builtin
# pragma pylint: disable=unused-wildcard-import
# pragma pylint: disable=wildcard-import
from __future__ import absolute_import
from __future__ import division
from __future__ import print_function
from __future__ import unicode_literals
from builtins import *

# pragma pylint: enable=redefined-builtin
# pragma pylint: enable=unused-wildcard-import
# pragma pylint: enable=wildcard-import

import os

try:
    from importlib.metadata import metadata  # Python 3.8
except ImportError:
    from importlib_metadata import metadata  # Python < 3.8


# Directories
FIFTYONE_DIR = os.path.abspath(os.path.dirname(__file__))
FIFTYONE_ENV = os.environ["VIRTUAL_ENV"]
FIFTYONE_CONFIG_DIR = os.path.join(os.path.expanduser("~"), ".fiftyone")
BASE_DIR = os.path.dirname(FIFTYONE_DIR)
EXAMPLES_DIR = os.path.join(BASE_DIR, "examples")


# Package metadata
_META = metadata("fiftyone")
NAME = _META["name"]
VERSION = _META["version"]
DESCRIPTION = _META["summary"]
AUTHOR = _META["author"]
AUTHOR_EMAIL = _META["author-email"]
URL = _META["home-page"]
LICENSE = _META["license"]
VERSION_LONG = "%s v%s, %s" % (NAME, VERSION, AUTHOR)

# MongoDB setup
DB_PATH = os.path.join(FIFTYONE_CONFIG_DIR, "var/lib/mongo")
DB_BIN_PATH = os.path.join(FIFTYONE_CONFIG_DIR, "bin", "mongod")
DB_LOG_PATH = os.path.join(FIFTYONE_CONFIG_DIR, "var/log/mongodb/mongo.log")
os.environ["PATH"] = ":".join([FIFTYONE_CONFIG_DIR, os.environ["PATH"]])
START_DB = [
    DB_BIN_PATH,
    "--dbpath",
    DB_PATH,
    "--logpath",
    DB_LOG_PATH,
    "--fork",
]

# Server setup
START_SERVER = [
    "gunicorn",
    "-w",
    "2",
    "-b",
    "127.0.0.1:5151",
    "fiftyone.server.main.app",
    "--daemon",
]

# App setup
FIFTYONE_APP_DIR = os.path.join(FIFTYONE_DIR, "../electron")
START_APP = ["yarn", "background-dev"]
