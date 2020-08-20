"""
Inter-process communication handling.

| Copyright 2017-2020, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""

import pickle
import socket
import socketserver


class IPCServer(socketserver.TCPServer):
    timeout = 2

    def __init__(self, on_message):
        super().__init__(("localhost", 0), IPCRequestHandler)
        self.on_message = on_message

    @property
    def port(self):
        return self.server_address[1]


class IPCRequestHandler(socketserver.StreamRequestHandler):
    def handle(self):
        try:
            message = pickle.load(self.rfile)
            reply = self.server.on_message(message)
            self.send_reply(reply)
        except Exception as e:
            self.send_reply(e)

    def send_reply(self, reply):
        pickle.dump(reply, self.wfile)


def send_request(port, message):
    s = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    s.connect(("localhost", port))
    pickle.dump(message, s.makefile("wb"))
    return pickle.load(s.makefile("rb"))
