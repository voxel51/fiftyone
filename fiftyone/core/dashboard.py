"""
Core module that defines the dashboard interactions.

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
from future.utils import itervalues

# pragma pylint: enable=redefined-builtin
# pragma pylint: enable=unused-wildcard-import
# pragma pylint: enable=wildcard-import

import os

import eta.core.utils as etau

import fiftyone.constants as foc


def launch_dashboard():
    """Launches the FiftyOne db, server, and app in that order"""
    devnull = _get_devnull()
    supress = {"stderr": devnull, "stdout": devnull}
    etau.call(foc.START_DB, **supress)
    etau.call(foc.START_SERVER, **supress)
    with etau.WorkingDir(foc.FIFTYONE_APP_DIR):
        etau.call(foc.START_APP, **supress)


def close_dashboard():
    """Close the FiftyOne app, server, and db in that order"""
    devnull = _get_devnull()
    supress = {"stderr": devnull, "stdout": devnull}
    with etau.WorkingDir(foc.FIFTYONE_APP_DIR):
        etau.call(foc.STOP_APP, **supress)
    etau.call(foc.STOP_SERVER, **supress)
    etau.call(foc.STOP_DB, **supress)


def _get_devnull():
    return open(os.devnull, "wb")
