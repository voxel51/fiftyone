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
