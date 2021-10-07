"""
Package-wide constants.

| Copyright 2017-2021, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""
from datetime import datetime
import os

from packaging.version import Version

try:
    from importlib.metadata import metadata  # Python 3.8
except ImportError:
    from importlib_metadata import metadata  # Python < 3.8


FIFTYONE_DIR = os.path.dirname(os.path.abspath(__file__))
FIFTYONE_CONFIG_DIR = os.path.join(os.path.expanduser("~"), ".fiftyone")
FIFTYONE_CONFIG_PATH = os.path.join(FIFTYONE_CONFIG_DIR, "config.json")
FIFTYONE_ANNOTATION_CONFIG_PATH = os.path.join(
    FIFTYONE_CONFIG_DIR, "annotation_config.json"
)
FIFTYONE_APP_CONFIG_PATH = os.path.join(FIFTYONE_CONFIG_DIR, "app_config.json")
BASE_DIR = os.path.dirname(FIFTYONE_DIR)
TEAMS_PATH = os.path.join(FIFTYONE_CONFIG_DIR, "var", "teams.json")
RESOURCES_DIR = os.path.join(FIFTYONE_DIR, "resources")

# Package metadata
_META = metadata("fiftyone")
NAME = _META["name"]
VERSION = _META["version"]
DESCRIPTION = _META["summary"]
AUTHOR = _META["author"]
AUTHOR_EMAIL = _META["author-email"]
URL = _META["home-page"]
LICENSE = _META["license"]
VERSION_LONG = "FiftyOne v%s, %s" % (VERSION, AUTHOR)
COPYRIGHT = "2017-%d, %s" % (datetime.now().year, AUTHOR)

DEV_INSTALL = os.path.isdir(
    os.path.normpath(
        os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", ".git")
    )
)
RC_INSTALL = "rc" in VERSION

# App configuration
DEFAULT_APP_COLOR_POOL = [
    "#ee0000",
    "#ee6600",
    "#993300",
    "#996633",
    "#999900",
    "#009900",
    "#003300",
    "#009999",
    "#000099",
    "#0066ff",
    "#6600ff",
    "#cc33cc",
    "#777799",
]

# MongoDB setup
try:
    from fiftyone.db import FIFTYONE_DB_BIN_DIR
except ImportError:
    # development installation
    FIFTYONE_DB_BIN_DIR = os.path.join(FIFTYONE_CONFIG_DIR, "bin")

DEFAULT_DATABASE = "fiftyone"
DEFAULT_DB_DIR = os.path.join(FIFTYONE_CONFIG_DIR, "var", "lib", "mongo")
MIGRATIONS_PATH = os.path.join(FIFTYONE_CONFIG_DIR, "migrations")
MIGRATIONS_HEAD_PATH = os.path.join(MIGRATIONS_PATH, "head.json")
MIGRATIONS_REVISIONS_DIR = os.path.join(
    FIFTYONE_DIR, "migrations", "revisions"
)
MONGODB_VERSION_RANGE = (Version("4.4"), Version("4.5"))  # [min, max)

# Server setup
SERVER_DIR = os.path.join(FIFTYONE_DIR, "server")

# App setup
try:
    from fiftyone.desktop import FIFTYONE_DESKTOP_APP_DIR
except ImportError:
    FIFTYONE_DESKTOP_APP_DIR = os.path.normpath(
        os.path.join(FIFTYONE_DIR, "../app")
    )

# Analytics
UA_DEV = "UA-141773487-10"
UA_PROD = "UA-141773487-9"
UA_ID = UA_DEV if DEV_INSTALL or RC_INSTALL else UA_PROD
