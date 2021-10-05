"""
FiftyOne Services.

| Copyright 2017-2021, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""
import logging
import os
import subprocess
import sys

import psutil
import requests
from retrying import retry

import eta.core.utils as etau

import fiftyone.constants as foc
import fiftyone.core.config as focn
import fiftyone.core.context as focx
import fiftyone.service.util as fosu


logger = logging.getLogger(__name__)


class ServiceException(Exception):
    """Base class for service-related exceptions."""

    pass


class ServiceListenTimeout(ServiceException):
    """Exception raised when a network-bound service fails to bind to a port."""

    def __init__(self, name, port=None):
        self.name = name
        self.port = port

    def __str__(self):
        message = "%s failed to bind to port" % self.name
        if self.port is not None:
            message += " " + str(self.port)

        return message


class ServiceExecutableNotFound(ServiceException):
    """Exception raised when the service executable is not found on disk."""

    pass


class Service(object):
    """Interface for FiftyOne services.

    All services must define a ``command`` property.

    Services are run in an isolated Python subprocess (see ``service/main.py``)
    to ensure that they are shut down when the main Python process exits. The
    ``command`` and ``working_dir`` properties control the execution of the
    service in the subprocess.
    """

    service_name = None
    working_dir = "."
    allow_headless = False

    def __init__(self):
        self._system = os.system
        self._disabled = os.environ.get(
            "FIFTYONE_DISABLE_SERVICES", False
        ) or (
            os.environ.get("FIFTYONE_HEADLESS", False)
            and not self.allow_headless
        )
        self.child = None
        if not self._disabled:
            self.start()

    def __del__(self):
        """Stops the service."""
        if not self._disabled:
            self.stop()

    @property
    def command(self):
        raise NotImplementedError("%r must define `command`" % type(self))

    @property
    def env(self):
        return {}

    @property
    def _service_args(self):
        """Arguments passed to the service entrypoint."""
        if not self.service_name:
            raise NotImplementedError(
                "%r must define `service_name`" % type(self)
            )

        return ["--51-service", self.service_name]

    def start(self):
        """Starts the service."""
        service_main_path = os.path.join(
            os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
            "service",
            "main.py",
        )

        # use psutil's Popen wrapper because its wait() more reliably waits
        # for the process to exit on Windows
        self.child = psutil.Popen(
            [sys.executable, service_main_path]
            + self._service_args
            + self.command,
            cwd=self.working_dir,
            stdin=subprocess.PIPE,
            env={**os.environ, "FIFTYONE_DISABLE_SERVICES": "1", **self.env},
        )

    def stop(self):
        """Stops the service."""
        self.child.stdin.close()
        try:
            self.child.wait()
        except TypeError:
            pass

    def wait(self):
        """Waits for the service to exit and returns its exit code."""
        return self.child.wait()

    @staticmethod
    def cleanup():
        """Performs any necessary cleanup when the service exits.

        This is called by the subprocess (cf. ``service/main.py``) and is not
        intended to be called directly.
        """
        pass

    def _wait_for_child_port(self, port=None, timeout=60):
        """Waits for any child process of this service to bind to a TCP port.

        Args:
            port (None): if specified, wait for a child to bind to this port
            timeout (60): the number of seconds to wait before failing

        Returns:
            the port the child has bound to (equal to the ``port`` argument
            if specified)

        Raises:
            ServiceListenTimeout: if the timeout was exceeded
        """

        @retry(
            wait_fixed=250,
            stop_max_delay=1000 * timeout,
            retry_on_exception=lambda e: isinstance(e, ServiceListenTimeout),
        )
        def find_port():
            for child in fosu.normalize_wrapper_process(self.child).children(
                recursive=True
            ):
                try:
                    for local_port in fosu.get_listening_tcp_ports(child):
                        if port is None or port == local_port:
                            return local_port

                except psutil.Error:
                    pass

            raise ServiceListenTimeout(etau.get_class_name(self), port)

        return find_port()

    @classmethod
    def find_subclass_by_name(cls, name):
        for subclass in cls.__subclasses__():
            if subclass.service_name == name:
                return subclass

            try:
                return subclass.find_subclass_by_name(name)
            except ValueError:
                pass

        raise ValueError("Unrecognized %s subclass: %s" % (cls.__name__, name))


class MultiClientService(Service):
    """Base class for services that support multiple clients."""

    # set when attaching to an existing process
    attached = False

    @property
    def _service_args(self):
        return super()._service_args + ["--multi"]

    def start(self):
        """Searches for a running instance of this service, or starts one
        if no instance is found.
        """
        for process in fosu.find_processes_by_args(self._service_args):
            desc = "Process %i (%s)" % (
                process.pid,
                " ".join(
                    [os.path.join("service", "main.py")] + self._service_args
                ),
            )
            logger.debug("Connecting to %s", desc)
            try:
                reply = fosu.send_ipc_message(
                    process, ("register", os.getpid())
                )
                if reply == True:
                    self.attached = True
                    self.child = process
                    return
                else:
                    logger.warning("Failed to connect to %s: %r", desc, reply)

            except IOError:
                logger.warning("%s did not respond", desc)

        super().start()

    def stop(self):
        """Disconnects from the service without actually stopping it."""
        if self.attached:
            self.attached = False
        elif self.child is not None:
            # this process is the original parent
            self.child.stdin.close()

        self.child = None


class DatabaseService(MultiClientService):
    """Service that controls the underlying MongoDB database."""

    service_name = "db"
    allow_headless = True

    MONGOD_EXE_NAME = "mongod"
    if sys.platform.startswith("win"):
        MONGOD_EXE_NAME += ".exe"

    @property
    def command(self):
        database_dir = focn.load_config().database_dir
        log_path = os.path.join(database_dir, "log", "mongo.log")

        args = [
            DatabaseService.find_mongod(),
            "--dbpath",
            database_dir,
            "--logpath",
            log_path,
            "--port",
            "0",
        ]
        if not sys.platform.startswith("win"):
            args.append("--nounixsocket")

        try:
            etau.ensure_dir(database_dir)
        except:
            raise PermissionError(
                "Database directory `%s` cannot be written to" % database_dir
            )

        try:
            etau.ensure_basedir(log_path)

            if not os.path.isfile(log_path):
                etau.ensure_empty_file(log_path)
        except:
            raise PermissionError(
                "Database log path `%s` cannot be written to" % log_path
            )

        if focx._get_context() == focx._COLAB:
            return ["sudo"] + args

        return args

    @property
    def port(self):
        return self._wait_for_child_port()

    @staticmethod
    def cleanup():
        """Deletes non-persistent datasets when the DB shuts down."""
        import fiftyone.core.dataset as fod
        import fiftyone.core.odm.database as food
        import fiftyone.service.util as fosu

        try:
            port = next(
                port
                for child in psutil.Process().children()
                for port in fosu.get_listening_tcp_ports(child)
            )
            food._connection_kwargs["port"] = port
            food._connect()
        except (StopIteration, psutil.Error):
            # mongod may have exited - ok to wait until next time
            return

        try:

            fod.delete_non_persistent_datasets()
            food.sync_database()
        except:
            # something weird may have happened, like a downward DB migration
            # - ok to wait until next time
            pass

    @staticmethod
    def find_mongod():
        """Returns the path to the `mongod` executable."""
        mongod = os.path.join(
            foc.FIFTYONE_DB_BIN_DIR, DatabaseService.MONGOD_EXE_NAME
        )

        if not os.path.isfile(mongod):
            raise ServiceExecutableNotFound("Could not find `mongod`")

        if not os.access(mongod, os.X_OK):
            raise PermissionError("`mongod` is not executable")

        return mongod


class ServerService(Service):
    """Service that controls the FiftyOne web server."""

    service_name = "server"
    working_dir = foc.SERVER_DIR
    allow_headless = True

    def __init__(self, port, address=None, do_not_track=False):
        self._port = port
        self._address = address
        self._do_not_track = do_not_track
        super().__init__()

    def start(self):
        address = self._address or "127.0.0.1"
        port = self._port

        try:
            server_version = requests.get(
                "http://%s:%i/fiftyone" % (address, port), timeout=2
            ).json()["version"]
        except:
            server_version = None

        if server_version is None:
            # There is likely not a fiftyone server running (remote or local),
            # so start a local server. If there actually is a fiftyone server
            # running that didn't respond to /fiftyone, the local server will
            # fail to start but the app will still connect successfully.
            super().start()
            self._wait_for_child_port(port=port)
        else:
            logger.info(
                "Connected to FiftyOne on port %i at %s.\nIf you are not "
                "connecting to a remote session, you may need to start a new "
                "session and specify a port",
                port,
                address,
            )
            if server_version != foc.VERSION:
                logger.warning(
                    "Server version (%s) does not match client version (%s)",
                    server_version,
                    foc.VERSION,
                )

    @property
    def command(self):
        command = [
            sys.executable,
            "main.py",
            "--port",
            str(self.port),
        ]

        if self.address:
            command += ["--address", self.address]

        return command

    @property
    def port(self):
        return self._port

    @property
    def address(self):
        return self._address

    @property
    def env(self):
        dnt = "1" if self._do_not_track else "0"
        return {"FIFTYONE_DO_NOT_TRACK": dnt}


class AppService(Service):
    """Service that controls the FiftyOne app."""

    service_name = "app"
    working_dir = foc.FIFTYONE_DESKTOP_APP_DIR

    def __init__(self, server_port=None, server_address=None):
        # initialize before start() is called
        self.server_port = server_port
        self.server_address = server_address
        super().__init__()

    @property
    def command(self):
        with etau.WorkingDir(foc.FIFTYONE_DESKTOP_APP_DIR):
            return self.find_app()

    def find_app(self):
        if foc.DEV_INSTALL:
            return ["yarn", "start-desktop"]

        for path in etau.list_files("./"):
            if path.endswith(".tar.gz"):
                logger.info("Installing FiftyOne App")
                etau.extract_tar(path, "./", delete_tar=True)

        pre = foc.FIFTYONE_DESKTOP_APP_DIR
        for path in etau.list_files("./"):
            if path.endswith(".exe"):
                return [os.path.join(pre + path)]

            if path.endswith(".AppImage"):
                return [os.path.join(pre, path)]

        if os.path.isdir("./FiftyOne.app"):
            return [
                os.path.join(
                    pre, "FiftyOne.app", "Contents", "MacOS", "FiftyOne"
                )
            ]

        raise RuntimeError(
            "Could not find FiftyOne app in %r" % foc.FIFTYONE_DESKTOP_APP_DIR
        )

    @property
    def env(self):
        env = {}
        if self.server_port is not None:
            env["FIFTYONE_SERVER_PORT"] = str(self.server_port)
            if foc.DEV_INSTALL:
                # override port 1212 used by "yarn dev" for hot-reloading
                # (specifying port 0 doesn't work here)
                env["PORT"] = str(self.server_port + 1)

        if self.server_address:
            env["FIFTYONE_SERVER_ADDRESS"] = str(self.server_address)

        return env
