"""
Package-wide constants.

| Copyright 2017-2025, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""

from datetime import datetime
import os

from packaging.version import Version

from importlib.metadata import metadata


CLIENT_TYPE = "fiftyone"

FIFTYONE_DIR = os.path.dirname(os.path.abspath(__file__))
FIFTYONE_CONFIG_DIR = os.path.join(os.path.expanduser("~"), ".fiftyone")
FIFTYONE_CONFIG_PATH = os.path.join(FIFTYONE_CONFIG_DIR, "config.json")
FIFTYONE_ANNOTATION_CONFIG_PATH = os.path.join(
    FIFTYONE_CONFIG_DIR, "annotation_config.json"
)
FIFTYONE_EVALUATION_CONFIG_PATH = os.path.join(
    FIFTYONE_CONFIG_DIR, "evaluation_config.json"
)
FIFTYONE_APP_CONFIG_PATH = os.path.join(FIFTYONE_CONFIG_DIR, "app_config.json")
BASE_DIR = os.path.dirname(FIFTYONE_DIR)
TEAMS_PATH = os.path.join(FIFTYONE_CONFIG_DIR, "var", "teams.json")
WELCOME_PATH = os.path.join(FIFTYONE_CONFIG_DIR, "var", "welcome.json")
RESOURCES_DIR = os.path.join(FIFTYONE_DIR, "resources")

#
# The compatible versions for this client
#
# RULES: Datasets from all compatible versions must be...
#   - Loadable by this client without error
#   - Editable by this client without causing any database edits that would
#     break the original client's ability to work with the dataset
#
# This setting may be ``None`` if this client has no compatibility with other
# versions
#
COMPATIBLE_VERSIONS = ">=0.19,<1.5"

# Package metadata
_META = metadata("fiftyone")
NAME = _META["name"]
VERSION = _META["version"]
DESCRIPTION = _META["summary"]
AUTHOR = _META["author"]
AUTHOR_EMAIL = _META["author-email"]
URL = _META.get("home-page", "https://github.com/voxel51/fiftyone")
LICENSE = _META.get("license", "Apache")
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

DEFAULT_COLOR_SCHEME = {
    "color_pool": DEFAULT_APP_COLOR_POOL,
    "fields": [],
    "label_tags": {"fieldColor": None, "valueColors": []},
    "default_mask_targets": [],
}

# MongoDB setup
try:
    from fiftyone.db import FIFTYONE_DB_BIN_DIR
except ImportError:
    # development installation
    FIFTYONE_DB_BIN_DIR = os.path.join(FIFTYONE_CONFIG_DIR, "bin")

DEFAULT_DB_DIR = os.path.join(FIFTYONE_CONFIG_DIR, "var", "lib", "mongo")
MIGRATIONS_PATH = os.path.join(FIFTYONE_CONFIG_DIR, "migrations")
MIGRATIONS_HEAD_PATH = os.path.join(MIGRATIONS_PATH, "head.json")
MIGRATIONS_REVISIONS_DIR = os.path.join(
    FIFTYONE_DIR, "migrations", "revisions"
)

MIN_MONGODB_VERSION = Version("4.4")
MAX_ALLOWABLE_FCV_DELTA = 1
MONGODB_SERVER_FCV_REQUIRED_CONFIRMATION = Version("7.0")
DATABASE_APPNAME = "fiftyone"

# Server setup
SERVER_DIR = os.path.join(FIFTYONE_DIR, "server")
