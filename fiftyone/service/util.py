"""
FiftyOne service utilities.

| Copyright 2017-2020, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""

import psutil

from fiftyone.service.ipc import send_request


def find_process_by_args(args):
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
            if p.info["username"] == current_username:
                cmdline = p.info["cmdline"]
                for i in range(len(cmdline) - len(args) + 1):
                    if cmdline[i : i + len(args)] == args:
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
