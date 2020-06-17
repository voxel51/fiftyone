from contextlib import contextmanager
import os
import pickle
import subprocess
import sys
import time

import psutil
import requests
import retrying

os.environ["FIFTYONE_DISABLE_SERVICES"] = "1"
import fiftyone.constants as foc
import fiftyone.core.service as fos


def get_child_processes():
    return psutil.Process().children(recursive=True)


def get_child_process_names():
    return [p.name() for p in get_child_processes()]


def wait_for_subprocess(callback, timeout=3):
    start_time = time.time()
    while time.time() < start_time + timeout:
        matches = list(filter(callback, get_child_processes()))
        if matches:
            return matches[0]
        time.sleep(0.2)
    raise RuntimeError("Process did not start after %f seconds" % (timeout))


def wait_for_subprocess_by_name(name, **kwargs):
    return wait_for_subprocess(lambda p: p.name() == name)


@retrying.retry(
    wait_fixed=500,
    stop_max_delay=5000,
    retry_on_exception=lambda e: isinstance(e, requests.RequestException),
)
def get_json_retry(url):
    print("get_json_retry")
    return requests.get(url).json()


@contextmanager
def cleanup_subprocesses(strict=False):
    try:
        yield
    finally:
        children = get_child_processes()
        for p in children:
            p.terminate()

        _, alive = psutil.wait_procs(children, timeout=3)
        for p in alive:
            p.kill()
        _, alive = psutil.wait_procs(alive, timeout=3)
        if alive:
            raise RuntimeError("%i processes not killed" % len(alive))

        if children and strict:
            raise RuntimeError(
                "%i processes did not exit when expected" % len(children)
            )


def test_db():
    with cleanup_subprocesses(strict=True):
        db = fos.DatabaseService()
        db.start()
        p = wait_for_subprocess_by_name(db.MONGOD_EXE_NAME)
        db.stop()
        assert not p.is_running()
        assert db.MONGOD_EXE_NAME not in get_child_process_names()


def test_server():
    with cleanup_subprocesses(strict=True):
        server = fos.ServerService(5151)
        server.start()
        p = wait_for_subprocess(lambda p: "main.py" in p.cmdline())
        assert p.is_running()
        res = get_json_retry("http://127.0.0.1:5151/fiftyone")
        assert res["version"] == foc.VERSION
        server.stop()
        assert not p.is_running()
