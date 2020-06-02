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
import sys

import eta.core.utils as etau

import fiftyone.constants as foc


logger = logging.getLogger(__name__)


class Service(object):
    """Interface for FiftyOne services.

    All services must implement :func:`Service.start` and :func:`Service.stop`.
    """

    working_dir = "."

    def __init__(self):
        """Creates (starts) the Service."""
        self._system = os.system
        self._is_server = os.environ.get("FIFTYONE_SERVER", False)
        self.child = None
        if not self._is_server:
            self.start()

    def __del__(self):
        """Deletes (stops) the Service."""
        if not self._is_server:
            try:
                self.stop()
            except Exception:
                # something probably failed due to interpreter shutdown, which
                # will be handled by _service_main.py
                pass

    @property
    def command(self):
        raise NotImplementedError("subclasses must define `command`")

    def start(self):
        """Starts the Service."""
        service_main_path = os.path.join(
            os.path.dirname(os.path.abspath(__file__)),
            "..",
            "_service_main.py",
        )
        self.child = subprocess.Popen(
            [sys.executable, service_main_path] + self.command,
            cwd=self.working_dir,
            stdin=subprocess.PIPE,
        )

    def stop(self):
        """Stops the Service."""
        self.child.send_signal(signal.SIGINT)


class DatabaseService(Service):
    """Service that controls the underlying MongoDB database."""

    command = [
        foc.DB_BIN_PATH,
        "--dbpath",
        foc.DB_PATH,
        "--logpath",
        foc.DB_LOG_PATH,
    ]

    def start(self):
        """Starts the DatabaseService."""
        for folder in (foc.DB_PATH, os.path.dirname(foc.DB_LOG_PATH)):
            if not os.path.isdir(folder):
                os.makedirs(folder)

        super().start()

        # Drop the entire database (lightweight!)
        import fiftyone.core.odm as foo

        foo.drop_database()


class ServerService(Service):
    """Service that controls the FiftyOne web server."""

    working_dir = foc.SERVER_DIR

    def __init__(self, port):
        self._port = port
        super(ServerService, self).__init__()

    @property
    def command(self):
        return [
            "gunicorn",
            "-w",
            "1",
            "--worker-class",
            "eventlet",
            "-b",
            "127.0.0.1:%d" % self._port,
            "main:app",
            "--reload",
        ]

    @property
    def port(self):
        """Getter for the current port"""
        return self._port


class AppService(Service):
    """Service that controls the FiftyOne app."""

    working_dir = foc.FIFTYONE_APP_DIR

    @property
    def command(self):
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
        return args
