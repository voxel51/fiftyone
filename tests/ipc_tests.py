import contextlib
import socket
import threading

import pytest

from fiftyone.service.ipc import IPCServer, send_request


@contextlib.contextmanager
def SingleRequestHandler(server):
    t = threading.Thread(target=server.handle_request)
    t.start()
    try:
        yield
    finally:
        t.join()


@contextlib.contextmanager
def MultiRequestHandler(server):
    t = threading.Thread(target=server.serve_forever)
    t.start()
    try:
        yield
    finally:
        server.shutdown()
        t.join()


def test_one_request():
    with IPCServer(lambda x: x * 2) as server, SingleRequestHandler(server):
        assert send_request(server.port, 5) == 10


def test_multiple_requests():
    with IPCServer(lambda x: x * 2) as server, MultiRequestHandler(server):
        assert send_request(server.port, 5) == 10
        assert send_request(server.port, "a") == "aa"


# def test_bad_request():
#     with IPCServer(lambda _: None) as server, SingleRequestHandler(server):
#         s = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
#         s.connect(("localhost", server.port))
#         s.send("foo" * 200)
#         print("recv", s.recv())
