"""
Package containing binaries needed for the FiftyOne database.
"""

import os

import fiftyone

FIFTYONE_DB_BIN_DIR = os.path.join(
    os.path.abspath(os.path.dirname(fiftyone.__file__)), "bin"
)
