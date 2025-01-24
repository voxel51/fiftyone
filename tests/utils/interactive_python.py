"""
A script that simulates a Python shell and accepts arbitrary commands to
execute. For use by service tests.

| Copyright 2017-2025, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""
import os

os.environ["FIFTYONE_DISABLE_SERVICES"] = "1"
from fiftyone.service.ipc import IPCServer


env = {}


def handle_message(message):
    try:
        code = compile(message, "", "eval")
    except SyntaxError:
        code = compile(message, "", "exec")
    return eval(code, env)


IPCServer(handle_message).serve_forever()
