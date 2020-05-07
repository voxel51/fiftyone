"""
Core module that defines the FiftyOne services.

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

import logging
import os

import eta.core.utils as etau

import fiftyone.constants as foc


logger = logging.getLogger(__name__)


class Service(object):
    """A Service is a class that implements a start method and stop method"""

    _DEVNULL = open(os.devnull, "wb")
    _SUPPRESS = {"stderr": _DEVNULL, "stdout": _DEVNULL}

    def __init__(self):
        """Creates the `Service`."""
        self._system = os.system
        self.start()

    def __del__(self):
        """Destroys the `Service`."""
        self.stop()

    def start(self):
        """Start the service"""
        raise NotImplementedError("subclasses must implement `start()`")

    def stop(self):
        """Stop the service"""
        raise NotImplementedError("subclasses must implement `stop()`")


class DatabaseService(Service):
    """A `DatabaseService` has start and stop control over the hidden
    installation of MongoDB.
    """

    def start(self):
        """Start the `DatabaseService`."""
        etau.call(foc.START_DB, **self._SUPPRESS)

    def stop(self):
        """Stop the `DatabaseService`."""
        self._system(foc.STOP_DB)


class ServerService(Service):
    """A `ServerService` has start and stop control over the FiftyOne web
    server.
    """

    def start(self):
        """Start the `ServerService`."""
        with etau.WorkingDir(foc.SERVER_DIR):
            etau.call(foc.START_SERVER, **self._SUPPRESS)

    def stop(self):
        """Stop the `ServerService`."""
        self._system(foc.STOP_SERVER)


class AppService(Service):
    """An `AppService` has start and stop control over the FiftyOne app."""

    def start(self):
        """Start the `AppService`."""
        with etau.WorkingDir(foc.FIFTYONE_APP_DIR):
            etau.call(foc.START_APP, **self._SUPPRESS)

    def stop(self):
        """Stop the `AppService`."""
        self._system(foc.STOP_APP)
