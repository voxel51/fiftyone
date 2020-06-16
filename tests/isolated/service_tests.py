from contextlib import contextmanager
import os
import pickle
import subprocess
import sys
import time

import psutil

os.environ["FIFTYONE_DISABLE_SERVICES"] = "1"
import fiftyone.core.service as fos


def get_child_processes():
    return psutil.Process().children(recursive=True)


def get_child_process_names():
    return [p.name() for p in get_child_processes()]


def wait_for_subprocess(name, timeout=3):
    start_time = time.time()
    while time.time() < start_time + timeout:
        if name in get_child_process_names():
            return
        time.sleep(0.2)
    raise RuntimeError(
        "Process %r did not start after %f seconds" % (name, timeout)
    )


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
        wait_for_subprocess(db.MONGOD_EXE_NAME)
        db.stop()
        assert db.MONGOD_EXE_NAME not in get_child_process_names()


def test_server():
    with cleanup_subprocesses(strict=True):
        server = fos.ServerService(5151)
        server.start()
        wait_for_subprocess("gunicorn")
        server.stop()
        assert "gunicorn" not in get_child_process_names()
