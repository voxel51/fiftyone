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

import logging
import os
import signal
import subprocess

import eta.core.utils as etau

import fiftyone.constants as foc


logger = logging.getLogger(__name__)


class Service(object):
    """Interface for FiftyOne services.

    All services must implement :func:`Service.start` and :func:`Service.stop`.
    """

    _DEVNULL = open(os.devnull, "wb")
    _SUPPRESS = {"stderr": _DEVNULL, "stdout": _DEVNULL}

    def __init__(self):
        self._system = os.system
        self.start()

    def __del__(self):
        self.stop()

    def start(self):
        """Starts the service."""
        raise NotImplementedError("subclasses must implement `start()`")

    def stop(self):
        """Stops the service."""
        raise NotImplementedError("subclasses must implement `stop()`")


class DatabaseService(Service):
    """Service that controls the underlying MongoDB database."""

    def start(self):
        etau.call(foc.START_DB, **self._SUPPRESS)

        # Drop the entire database (lightweight!)
        import fiftyone.core.odm as foo

        foo.drop_database()

    def stop(self):
        self._system(foc.STOP_DB)


class ServerService(Service):
    """Service that controls the FiftyOne web server."""

    def start(self):
        with etau.WorkingDir(foc.SERVER_DIR):
            etau.call(foc.START_SERVER, **self._SUPPRESS)

    def stop(self):
        self._system(foc.STOP_SERVER)


class AppService(Service):
    """Service that controls the FiftyOne app."""

    def start(self):
        with etau.WorkingDir(foc.FIFTYONE_APP_DIR):
            if os.path.isfile("FiftyOne.AppImage"):
                # linux
                args = ["./FiftyOne.AppImage"]
            elif os.path.isfile("package.json"):
                # dev build
                args = ["yarn", "dev"]
            else:
                raise RuntimeError(
                    "Could not find FiftyOne dashboard in %r"
                    % foc.FIFTYONE_APP_DIR
                )
        # TODO: python <3.3 compat
        self.process = subprocess.Popen(
            args,
            cwd=foc.FIFTYONE_APP_DIR,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
        )

    def stop(self):
        # TODO: python <3.3 compat
        self.process.send_signal(signal.SIGINT)
        try:
            self.process.wait(timeout=5)
        except subprocess.TimeoutExpired:
            logger.warning(
                "Dashboard exit timed out; killing (PID = %i)",
                self.process.pid,
            )
            self.process.kill()
