"""
Package-wide constants.

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
import sys

try:
    from importlib.metadata import metadata  # Python 3.8
except ImportError:
    from importlib_metadata import metadata  # Python < 3.8


FIFTYONE_DIR = os.path.dirname(os.path.abspath(__file__))
FIFTYONE_CONFIG_DIR = os.path.join(os.path.expanduser("~"), ".fiftyone")
FIFTYONE_CONFIG_PATH = os.path.join(FIFTYONE_CONFIG_DIR, "config.json")
BASE_DIR = os.path.dirname(FIFTYONE_DIR)
EXAMPLES_DIR = os.path.join(FIFTYONE_DIR, "examples")
if not os.path.isdir(EXAMPLES_DIR):
    EXAMPLES_DIR = os.path.join(BASE_DIR, "examples")
DEV_INSTALL = os.path.isdir(
    os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", ".git")
)

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
try:
    from fiftyone.db import FIFTYONE_DB_BIN_DIR
except ImportError:
    # development installation
    FIFTYONE_DB_BIN_DIR = os.path.join(FIFTYONE_CONFIG_DIR, "bin")
DB_PATH = os.path.join(FIFTYONE_CONFIG_DIR, "var/lib/mongo")
DB_BIN_PATH = os.path.join(FIFTYONE_DB_BIN_DIR, "mongod")
DB_CLIENT_BIN_PATH = os.path.join(FIFTYONE_DB_BIN_DIR, "mongo")
DB_LOG_PATH = os.path.join(FIFTYONE_CONFIG_DIR, "var/log/mongodb/mongo.log")

# Server setup
SERVER_DIR = os.path.join(FIFTYONE_DIR, "server")
SERVER_ADDR = "http://127.0.0.1:%d"

# App setup
try:
    from fiftyone.gui import FIFTYONE_APP_DIR
except ImportError:
    FIFTYONE_APP_DIR = os.path.join(FIFTYONE_DIR, "../electron")
