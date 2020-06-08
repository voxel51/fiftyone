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

import atexit
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
        """Creates (starts) the Service."""
        self._system = os.system
        self._is_server = os.environ.get(
            "FIFTYONE_SERVER", False
        ) or os.environ.get("FIFTYONE_DISABLE_SERVICES", False)
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
        for folder in (foc.DB_PATH, os.path.dirname(foc.DB_LOG_PATH)):
            if not os.path.isdir(folder):
                os.makedirs(folder)

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
        _close_on_exit(self)

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
        """Starts the AppService."""
        with etau.WorkingDir(foc.FIFTYONE_APP_DIR):
            if os.path.isfile("FiftyOne.AppImage"):
                # linux
                args = ["./FiftyOne.AppImage"]
            elif os.path.isfile("package.json"):
                # dev build
                args = ["yarn", "dev"]
            elif os.path.isdir("FiftyOne.app"):
                # -W: wait for the app to terminate
                # -n: open a new instance of the app
                # TODO: the app doesn't run as a subprocess of `open`, so it
                # won't get killed by stop()
                args = ["open", "-W", "-n", "./FiftyOne.app"]
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
        """Stops the AppService."""
        # TODO: python <3.3 compat
        if not getattr(self, "process", None):
            return
        self.process.send_signal(signal.SIGINT)
        try:
            self.process.wait(timeout=5)
        except subprocess.TimeoutExpired:
            logger.warning(
                "Dashboard exit timed out; killing (PID = %i)",
                self.process.pid,
            )
            self.process.kill()


def _close_on_exit(service):
    def handle_exit(*args):
        try:
            service.stop()
        except:
            pass

    atexit.register(handle_exit)
    signal.signal(signal.SIGTERM, handle_exit)
    signal.signal(signal.SIGINT, handle_exit)
