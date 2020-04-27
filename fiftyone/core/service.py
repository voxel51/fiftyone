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


DEVNULL = open(os.devnull, "wb")
SUPRESS = {"stderr": DEVNULL, "stdout": DEVNULL}


class Service(object):
    """A Service is a class that implements a start method and stop method"""

    def __init__(self):
        """Creates the `Service`."""
        self.start()

    def __del__(self):
        """Destroys the `Service`."""
        self.stop()

    def start(self):
        """Start the service"""
        raise NotImplementedError("subclasses must implement `start()`")

    def start(self):
        """Stop the service"""
        raise NotImplementedError("subclasses must implement `stop()`")


class DatabaseService(Service):
    """A `DatabaseService` has start and stop control over the hidden
    installation of MongoDB.
    """

    def start(self):
        """Stop the `DatabaseService`."""
        etau.call(foc.START_DB, **SUPRESS)

    def stop(self):
        """Start the `DatabaseService`."""
        etau.call(foc.STOP_DB, **SUPRESS)


class ServerService(Service):
    """A `ServerService` has start and stop control over the FiftyOne web
    server.
    """

    def start(self):
        """Stop the `ServerService`."""
        etau.call(foc.START_SERVER, **SUPRESS)

    def stop(self):
        """Start the `ServerService`."""
        etau.call(foc.STOP_SERVER, **SUPRESS)


class AppService(Service):
    """An `AppService` has start and stop control over the FiftyOne app.
    """

    def start(self):
        """Stop the `AppService`."""
        with etau.WorkingDir(foc.FIFTYONE_APP_DIR):
            etau.call(foc.START_APP, **SUPRESS)

    def stop(self):
        """Start the `AppService`."""
        etau.call(foc.STOP_APP, **SUPRESS)
