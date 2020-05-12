"""
Package containing binaries needed for the FiftyOne dashboard.
"""

import os

import fiftyone

FIFTYONE_APP_DIR = os.path.join(
    os.path.abspath(os.path.dirname(fiftyone.__file__)), "bin"
)
