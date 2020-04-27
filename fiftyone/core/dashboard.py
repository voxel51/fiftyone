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
    """Launches the FiftyOne server and app"""
    gunicorn = [
        "gunicorn",
        "-w",
        "2",
        "-b",
        "127.0.0.1:5151",
        "fiftyone.server.main:app",
        "--daemon",
    ]
    etau.call(gunicorn)
    devnull = open(os.devnull, "wb")
    with etau.WorkingDir(foc.FIFTYONE_APP_DIR):
        etau.call(["yarn", "background-dev"], stdout=devnull, stderr=devnull)
