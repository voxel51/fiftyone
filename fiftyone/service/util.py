"""
FiftyOne service utilities.

| Copyright 2017-2021, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""

import psutil

from fiftyone.service.ipc import send_request


def describe_process(process):
    """Returns a detailed description of a process.

    Args:
        process (psutil.Process)

    Returns:
        str
    """
    try:
        details = repr(process.cmdline())
    except psutil.Error:
        try:
            details = process.name()
        except psutil.Error:
            details = "unknown"
    return "Process %i (%s)" % (process.pid, details)


def _is_wrapper_process(process):
    """Returns true if the specified process is a wrapper around a single
    child process with the same arguments.

    This can happen on Windows when a Python subprocess is created. These
    processes should generally be ignored.

    Args:
        process (psutil.Process)

    Returns:
        bool
    """
    try:
        children = process.children()
        if len(children) != 1:
            return False
        if process.cmdline()[1:] == children[0].cmdline()[1:]:
            return True
    except psutil.Error:
        pass
    return False


def normalize_wrapper_process(process):
    """Returns the given process, or its child if it is a wrapper processes.

    See _is_wrapper_process() for details.

    Args:
        process (psutil.Process)

    Returns:
        psutil.Process
    """
    if _is_wrapper_process(process):
        try:
            return process.children()[0]
        except IndexError:
            pass
    return process


def find_processes_by_args(args):
    """Finds a process with the specified command-line arguments.

    Only processes for the current user will be returned.

    Args:
        args (list[str]): a list of arguments, in the order to search for

    Returns:
        generator of psutil.Process objects
    """
    if not isinstance(args, list):
        raise TypeError("args must be list")
    if not args:
        raise ValueError("empty search")

    current_username = psutil.Process().username()
    for p in psutil.process_iter(["cmdline", "username"]):
        try:
            if p.info["username"] == current_username and p.info["cmdline"]:
                cmdline = p.info["cmdline"]
                for i in range(len(cmdline) - len(args) + 1):
                    if cmdline[i : i + len(args)] == args:
                        if not _is_wrapper_process(p):
                            yield p
        except (psutil.NoSuchProcess, psutil.AccessDenied):
            pass


def get_listening_tcp_ports(process):
    """Retrieves a list of TCP ports that the specified process is listening on.

    Args:
        process (psutil.Process): the process to check

    Returns:
        generator of integers
    """
    for conn in process.connections(kind="tcp"):
        if (
            not conn.raddr  # not connected to a remote socket
            and conn.status == psutil.CONN_LISTEN
        ):
            yield conn.laddr[1]  # port


def send_ipc_message(process, message):
    """Sends a message to a process's IPCServer.

    Args:
        process (psutil.Process): process to send the message to
        message (any type)

    Returns:
        response (any type)
    """
    try:
        port = next(get_listening_tcp_ports(process))
    except StopIteration:
        raise IOError("Process %i has no listening server" % process.pid)
    return send_request(port, message)
