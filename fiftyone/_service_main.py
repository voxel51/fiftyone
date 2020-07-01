"""
This script provides a consistent environment for services to run in. The basic
architecture is:

- parent process (python, ipython, etc.)
    - this process, referred to as the "current" process (_service_main.py)
        - child process (the service)
            - (optional): any child processes that the service creates

Some services that we spin up do not terminate on their own when their parent
process terminates, so they need to be killed explicitly. However, if the
parent process is a Python interpreter that is in the process of shutting down,
it cannot reliably kill its children. This script works around these issues by
detecting when the parent process exits, terminating its children, and only
then exiting itself.

| Copyright 2017-2020, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""
import collections
import enum
import os
import signal
import subprocess
import sys
import threading

import psutil


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


if __name__ != "__main__":
    raise RuntimeError(
        "This file is for internal use only and cannot be imported"
    )

command = sys.argv[1:]
if not command:
    raise ValueError("No command given")

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

    This should only occur when the parent process has exited.
    """
    while len(sys.stdin.read(1024)):
        pass
    trigger_exit(ExitMode.PARENT)


def shutdown():
    """Kill subprocesses and wait for them to finish.

    Also dumps output if the main child process fails to exit cleanly.
    """
    # "yarn dev" doesn't pass SIGTERM to its children - to be safe, kill all
    # subprocesses of the child process first
    try:
        for subchild in child.children(recursive=True):
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
    if exit_mode == ExitMode.CHILD and child.returncode > 0:
        sys.stdout.buffer.write(child_stdout.to_bytes())
        sys.stdout.flush()
        sys.stderr.write(
            "Subprocess %r exited with error %i:\n"
            % (command, child.returncode)
        )
        sys.stderr.buffer.write(child_stderr.to_bytes())
        sys.stderr.flush()


stdin_thread = threading.Thread(target=monitor_stdin)
stdin_thread.daemon = True
stdin_thread.start()

exiting.wait()

shutdown()
