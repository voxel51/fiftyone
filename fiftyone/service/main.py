"""
This script provides a consistent environment for services to run in. The basic
architecture is:

- parent process (python, ipython, etc.)
    - this process, referred to as the "current" process (service/main.py)
        - child process (the service)
            - (optional): any child processes that the service creates
- clients (any other Python processes that are using this service) - see below

Some services that we spin up do not terminate on their own when their parent
process terminates, so they need to be killed explicitly. However, if the
parent process is a Python interpreter that is in the process of shutting down,
it cannot reliably kill its children. This script works around these issues by
detecting when the parent process exits, terminating its children, and only
then exiting itself.

Some services can also only have a single running instance per user. Notably,
only one instance of MongoDB can use a given data folder. To support this, when
invoked with the "--multi" option, this script allows additional "clients", i.e.
other Python processes using FiftyOne, to register themselves at any time. This
script will continue running in the background and keep the child process alive
until all registered clients, including the original parent process, have
exited.

| Copyright 2017-2023, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""
import argparse
import collections
import enum
import os
import signal
import subprocess
import sys
import threading
import traceback

import psutil

os.environ["FIFTYONE_DISABLE_SERVICES"] = "1"
from fiftyone.service.ipc import IPCServer


lock = threading.Lock()

# global flag set when either the parent or child has terminated, to trigger
# shutdown of the current process (and children as necessary)
exiting = threading.Event()


class ExitMode(enum.IntEnum):
    CHILD = 1
    PARENT = 2


# set to indicate whether the child or parent exited first
exit_mode = None


def trigger_exit(mode):
    """Start the shutdown process."""
    with lock:
        global exit_mode
        if exit_mode is None:
            exit_mode = ExitMode(mode)
    exiting.set()


def start_daemon_thread(target):
    thread = threading.Thread(target=target)
    thread.daemon = True
    thread.start()
    return thread


class ChildStreamMonitor(object):
    """Monitor for an output stream (stdout or stderr) of a child process.

    This class serves multiple purposes:
    - Collects output from the child process in a rolling buffer in the
      background, and makes it available in a thread-safe manner.
    - Causes the current process to exit when the child process closes the
      stream (i.e. when the child process exits).
    """

    def __init__(self, stream):
        self.stream = stream
        self.output_deque = collections.deque(maxlen=4)

        thread = threading.Thread(target=self._run_monitor_thread)
        thread.start()

    def _run_monitor_thread(self):
        """Background task to collect output from the child process.

        This is primarily necessary to keep the child process from hanging,
        which would occur if it produces too much output that the current
        process doesn't read, but the collected output is also made available
        for convenience.
        """
        while True:
            chunk = self.stream.read(1024)
            if not chunk:
                # EOF - subprocess has exited, so trigger shutdown
                trigger_exit(ExitMode.CHILD)
                break
            self.output_deque.appendleft(chunk)

    def to_bytes(self):
        """Return output recently collected from the child process.

        Currently, this is limited to the most recent 4KB.
        """
        return b"".join(self.output_deque)


class ClientMonitor(object):
    """Monitor to keep track of all clients using this service.

    This is only used for services that use multiple clients, e.g. the database
    service. In addition to tracking the original parent process, other
    processes can also request to be tracked by sending a message to this
    process as a tuple: ("register", PID). trigger_exit(PARENT) is only called
    after the original parent and all registered clients have shut down.
    """

    # sentinel used to represent the original parent (which is tracked without
    # its PID)
    _PARENT = "parent"

    def __init__(self):
        """Creates and starts a client monitor."""
        # This has an internal lock, so it is reused for any operations that
        # need to be synchronized
        self.cond = threading.Condition()
        # A set of clients (psutil.Process objects, which are hashable).
        # As long as monitor_stdin() hasn't been called yet, we can assume the
        # parent is still alive, and this can be changed later
        self.clients = {ClientMonitor._PARENT}
        # start background tasks
        self.thread = start_daemon_thread(target=self._background_loop)
        self.server = IPCServer.run_in_background(
            on_message=self._handle_message
        )

    def notify_parent_exit(self):
        """Notifies the monitor that the original parent process has exited."""
        self._notify_exit(ClientMonitor._PARENT)

    def _background_loop(self):
        """Main background loop - waits for all clients to exit, then shuts down
        the current process."""
        with self.cond:
            while self.clients:
                self.cond.wait()
            # all clients have exited now, so shut down
            trigger_exit(ExitMode.PARENT)

    def _background_wait(self, process):
        try:
            process.wait()
        except psutil.Error:
            pass
        finally:
            self._notify_exit(process)

    def _notify_exit(self, process):
        """Notifies _background_loop that a client has exited."""
        with self.cond:
            self.clients.remove(process)
            self.cond.notify_all()

    def _handle_message(self, message):
        """Handles an incoming IPC message.

        This currently supports registering and unregistering clients.

        Args:
            message (tuple): a 2-item tuple (command: str, argument)

        Returns:
            response to send to the client (True on success, Exception on failure)
        """
        if not isinstance(message, tuple):
            raise TypeError("Expected tuple, got " + str(type(message)))
        command, arg = message
        with lock:
            if exiting.is_set():
                raise RuntimeError("service is exiting, cannot connect")
            if command == "register":
                process = psutil.Process(int(arg))
                with self.cond:
                    if process not in self.clients:
                        self.clients.add(process)
                        start_daemon_thread(
                            target=lambda: self._background_wait(process)
                        )
                    return True
            elif command == "unregister":
                process = psutil.Process(int(arg))
                self._notify_exit(process)
                return True
            else:
                raise ValueError("Unrecognized command: " + repr(command))


if __name__ != "__main__":
    raise RuntimeError(
        "This file is for internal use only and cannot be imported"
    )

parser = argparse.ArgumentParser()
parser.add_argument(
    "--51-service",
    dest="service_name",
    metavar="SERVICE_NAME",
    type=str,
    required=True,
)
parser.add_argument("--multi", action="store_true")

args, command = parser.parse_known_args()

# Services may define additional flags beyond ``--51-service`` and ``--multi``
# which we do not need here
while command and command[0].startswith("--"):
    command = command[2:]

if not command:
    raise ValueError("No command given")

if command[0].startswith("--"):
    raise ValueError("Unhandled service argument: %s" % command[0])


if args.multi:
    client_monitor = ClientMonitor()

# ignore signals sent to the parent process - parent process termination is
# handled below, and necessary for cleaning up the child process

if hasattr(os, "setpgrp"):
    # UNIX-only: prevent child process from receiving SIGINT/other signals
    # from the parent process
    os.setpgrp()

# also explicitly ignore SIGINT for good measure (note that this MUST be done
# before spinning up the child process, as the child inherits signal handlers)
signal.signal(signal.SIGINT, signal.SIG_IGN)


popen_kwargs = {}
if sys.platform.startswith("win"):
    # CREATE_NEW_PROCESS_GROUP: disable ctrl-c
    # https://docs.microsoft.com/en-us/windows/win32/procthread/process-creation-flags?redirectedfrom=MSDN
    popen_kwargs["creationflags"] = 0x00000200


# use psutil's wrapper around subprocess.Popen for convenience (e.g. it makes
# finding the child's children significantly easier)
child = psutil.Popen(
    command,
    stdin=subprocess.DEVNULL,
    stdout=subprocess.PIPE,
    stderr=subprocess.PIPE,
    **popen_kwargs,
)
child_stdout = ChildStreamMonitor(child.stdout)
child_stderr = ChildStreamMonitor(child.stderr)


def monitor_stdin():
    """Trigger shutdown when the parent process closes this process's stdin.
    This will occur if the :class:`fiftyone.core.service.DatabaseService`
    singleton destroyed.

    This should only occur when the parent process has exited.
    """
    while len(sys.stdin.read(1024)):
        pass
    if args.multi:
        client_monitor.notify_parent_exit()
    else:
        trigger_exit(ExitMode.PARENT)


def shutdown():
    """Kill subprocesses and wait for them to finish.

    Also dumps output if the main child process fails to exit cleanly.
    """

    # "yarn dev" doesn't pass SIGTERM to its children - to be safe, kill all
    # subprocesses of the child process first
    try:
        # children() returns parent processes first - start with children
        # instead to make killing "yarn dev" more reliable
        for subchild in reversed(child.children(recursive=True)):
            try:
                subchild.terminate()
            except psutil.NoSuchProcess:
                # we may have already caused it to exit by killing its parent
                pass
        child.terminate()
    except psutil.NoSuchProcess:
        # child already exited
        pass

    child.wait()
    if exit_mode == ExitMode.CHILD and child.returncode != 0:
        sys.stdout.buffer.write(child_stdout.to_bytes())
        sys.stdout.flush()
        sys.stderr.write(
            "Subprocess %r exited with error %i:\n"
            % (command, child.returncode)
        )
        sys.stderr.buffer.write(child_stderr.to_bytes())
        sys.stderr.flush()


stdin_thread = start_daemon_thread(target=monitor_stdin)

exiting.wait()

shutdown()
