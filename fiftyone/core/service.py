"""
FiftyOne Services.

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

import eta.core.utils as etau

import fiftyone.constants as foc


class Service(object):
    """Interface for FiftyOne services.

    All services must implement :func:`Service.start` and :func:`Service.stop`.
    """

    _DEVNULL = open(os.devnull, "wb")
    _SUPPRESS = {"stderr": _DEVNULL, "stdout": _DEVNULL}

    def __init__(self):
        """Creates (starts) the Service."""
        self._system = os.system
        self._is_server = os.environ.get("FIFTYONE_SERVER", False)
        if not self._is_server:
            self.start()

    def __del__(self):
        """Deletes (stops) the Service."""
        if not self._is_server:
            self.stop()

    def start(self):
        """Starts the Service."""
        raise NotImplementedError("subclasses must implement `start()`")

    def stop(self):
        """Stops the Service."""
        raise NotImplementedError("subclasses must implement `stop()`")


class DatabaseService(Service):
    """Service that controls the underlying MongoDB database."""

    def start(self):
        """Starts the DatabaseService."""
        etau.call(foc.START_DB, **self._SUPPRESS)

        # Drop the entire database (lightweight!)
        import fiftyone.core.odm as foo

        foo.drop_database()

    def stop(self):
        """Stops the DatabaseService."""
        self._system(foc.STOP_DB)


class ServerService(Service):
    """Service that controls the FiftyOne web server."""

    def __init__(self, port):
        self._port = port
        super(ServerService, self).__init__()

    def start(self):
        """Starts the ServerService."""
        cmd = " ".join(foc.START_SERVER) % self._port
        with etau.WorkingDir(foc.SERVER_DIR):
            etau.call(cmd.split(" "), **self._SUPPRESS)

    def stop(self):
        """Stops the ServerService."""
        self._system(foc.STOP_SERVER % self._port)

    @property
    def port(self):
        """Getter for the current port"""
        return self._port


class AppService(Service):
    """Service that controls the FiftyOne app."""

    def start(self):
        """Starts the AppService.

        TODO: Add production call to start the app
        """
        with etau.WorkingDir(foc.FIFTYONE_APP_DIR):
            etau.call(foc.START_APP, **self._SUPPRESS)

    def stop(self):
        """Stops the AppService.

        Noop as the session requests the app to close itself.
        """
        pass
