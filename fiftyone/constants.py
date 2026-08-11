"""
Package-wide constants.

| Copyright 2017-2026, Voxel51, Inc.
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
COMPATIBLE_VERSIONS = ">=0.19,<2"

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
# BEGIN generated palette -- run tools/sync_voodoo_palette.py to update
DEFAULT_APP_COLOR_POOL = [
    "#FF6D04",  # 1: orange 500
    "#2563EB",  # 2: blue 500
    "#1E7D45",  # 3: green 500
    "#8B5CF6",  # 4: purple 500
    "#DB2777",  # 5: pink 500
    "#D97706",  # 6: yellow 500
    "#0D9488",  # 7: teal 500
    "#6F42C1",  # 8: purple 600
    "#532E91",  # 9: purple 700
    "#C33636",  # 10: red 500
    "#B26003",  # 11: yellow 600
    "#166638",  # 12: green 600
]
# END generated palette

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

MONGODB_MIN_VERSION = Version("6.0")
MONGODB_MAX_ALLOWABLE_FCV_DELTA = 1
MONGODB_SERVER_FCV_REQUIRED_CONFIRMATION = Version("7.0")
DATABASE_APPNAME = "fiftyone"

# Server setup
SERVER_DIR = os.path.join(FIFTYONE_DIR, "server")
