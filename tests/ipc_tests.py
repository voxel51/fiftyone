import contextlib
import pickle
import socket
import threading
import time

import pytest

from fiftyone.service.ipc import IPCServer, send_request


@contextlib.contextmanager
def SingleRequestHandler(server):
    t = threading.Thread(target=server.handle_request)
    t.start()
    try:
        yield
    finally:
        server.stop()
        t.join()


@contextlib.contextmanager
def MultiRequestHandler(server):
    t = threading.Thread(target=server.serve_forever)
    t.start()
    try:
        yield
    finally:
        server.stop()
        t.join()


def test_one_request():
    with IPCServer(lambda x: x * 2) as server, SingleRequestHandler(server):
        assert send_request(server.port, 5) == 10


def test_multiple_requests():
    with IPCServer(lambda x: x * 2) as server, MultiRequestHandler(server):
        assert send_request(server.port, 5) == 10
        assert send_request(server.port, "a") == "aa"


def test_bad_request():
    with IPCServer(lambda _: None) as server, SingleRequestHandler(server):
        s = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        s.connect(("localhost", server.port))
        s.send(b"foo")
        res = pickle.loads(s.recv(2048))
        assert isinstance(res, pickle.UnpicklingError)


def test_large_request():
    with IPCServer(lambda x: x) as server, SingleRequestHandler(server):
        data = list(range(10000))
        assert send_request(server.port, data) == data


def test_timeout():
    with IPCServer(lambda _: None) as server:
        server.timeout = 1
        timeout_called = threading.Event()
        server.handle_timeout = timeout_called.set
        with SingleRequestHandler(server):
            time.sleep(server.timeout + 0.5)
        assert timeout_called.is_set()


def test_stop_single():
    requests = []
    with IPCServer(requests.append) as server, SingleRequestHandler(server):
        server.timeout = 1
        server.stop()
        with pytest.raises(socket.error):
            send_request(server.port, 5)
    assert not requests


def test_stop_multi():
    requests = []
    with IPCServer(requests.append) as server, MultiRequestHandler(server):
        send_request(server.port, 1)
        assert requests == [1]
        server.stop()
        with pytest.raises(socket.error):
            send_request(server.port, 2)
    assert requests == [1]


def test_run_in_background():
    requests = []
    server = IPCServer.run_in_background(requests.append)
    send_request(server.port, 2)
    send_request(server.port, 3)
    assert requests == [2, 3]
