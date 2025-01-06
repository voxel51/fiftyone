"""
Service tests.

| Copyright 2017-2025, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""
from contextlib import contextmanager
import os
import sys
import time
import unittest

import psutil
import requests
import retrying

os.environ["FIFTYONE_DISABLE_SERVICES"] = "1"
os.environ["FIFTYONE_DATABASE_ADMIN"] = "true"
os.environ["FIFTYONE_DO_NOT_TRACK"] = "true"
import fiftyone as fo
import fiftyone.constants as foc
import fiftyone.core.service as fos
import fiftyone.service.util as fosu


MONGOD_EXE_NAME = fos.DatabaseService.MONGOD_EXE_NAME


def get_child_processes(process=psutil.Process()):
    return process.children(recursive=True)


def get_child_process_names(**kwargs):
    return [p.name() for p in get_child_processes(**kwargs)]


def wait_for_subprocess(callback, timeout=3, **kwargs):
    start_time = time.time()
    while time.time() < start_time + timeout:
        matches = list(filter(callback, get_child_processes(**kwargs)))
        if matches:
            return matches[0]
        time.sleep(0.2)
    raise RuntimeError("Process did not start after %f seconds" % (timeout))


def wait_for_subprocess_by_name(name, **kwargs):
    return wait_for_subprocess(lambda p: p.name() == name, **kwargs)


def wait_for_mongod_exit(timeout=1):
    try:
        mongod_process = wait_for_subprocess_by_name(
            MONGOD_EXE_NAME, timeout=0.01
        )
    except RuntimeError:
        return
    mongod_process.wait(timeout=timeout)


@retrying.retry(
    wait_fixed=500,
    stop_max_delay=5000,
    retry_on_exception=lambda e: isinstance(e, requests.RequestException),
)
def get_json_retry(url):
    return requests.get(url).json()


@contextmanager
def cleanup_subprocesses(strict=False):
    try:
        yield
    finally:
        children = get_child_processes()
        for p in children:
            if strict:
                print(
                    "cleanup_subprocesses: found %r: %r"
                    % (p.name(), p.cmdline())
                )
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


class InteractiveSubprocess(object):
    """Wrapper for an interactive Python subprocess.

    Must be used as a context manager.
    """

    process = None

    def __init__(self, autostart=False):
        if autostart:
            self.start()

    def start(self):
        env = os.environ.copy()
        env.pop("FIFTYONE_DISABLE_SERVICES", None)
        self.process = psutil.Popen(
            [
                sys.executable,
                os.path.join(
                    os.path.dirname(os.path.abspath(__file__)),
                    "..",
                    "utils",
                    "interactive_python.py",
                ),
            ],
            env=env,
        )

    def stop(self):
        if self.process:
            self.process.terminate()
            self.process.wait()
        self.process = None

    def __enter__(self):
        self.start()
        return self

    def __exit__(self, *args):
        self.stop()

    @retrying.retry(
        stop_max_delay=2000,
        retry_on_exception=lambda e: isinstance(e, (IOError, psutil.Error)),
    )
    def run_code(self, code):
        return fosu.send_ipc_message(
            fosu.normalize_wrapper_process(self.process), code
        )


_start_db_snippet = """
import fiftyone as fo
import fiftyone.core.service as fos
db = fos.DatabaseService()
db.start()
"""

_list_datasets_snippet = """
__import__("fiftyone.core.dataset").list_datasets()
"""


@unittest.skip("Unstable, fix me")
def test_db():
    with cleanup_subprocesses(strict=True):
        db = fos.DatabaseService()
        db.start()
        # make sure it started a new mongod process
        assert db.child is not None
        assert not db.attached
        p = wait_for_subprocess_by_name(MONGOD_EXE_NAME)
        # brief grace period because MultiClientService doesn't stop children
        # immediately
        child = db.child
        db.stop()
        psutil.wait_procs([p, child], timeout=2)
        assert not p.is_running()
        assert MONGOD_EXE_NAME not in get_child_process_names()


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


@unittest.skip("Unstable, fix me")
def test_db_interactive():
    with cleanup_subprocesses(strict=True), InteractiveSubprocess() as ip:
        ip.run_code(_start_db_snippet)
        assert MONGOD_EXE_NAME in get_child_process_names(process=ip.process)


def _check_db_connectivity(interactive_subprocess):
    assert isinstance(
        interactive_subprocess.run_code(_list_datasets_snippet), list
    )


@unittest.skip("Unstable, fix me")
def test_db_multi_client():
    with cleanup_subprocesses(strict=True):
        ip1 = InteractiveSubprocess(autostart=True)
        ip2 = InteractiveSubprocess(autostart=True)
        try:
            ip1.run_code(_start_db_snippet)
            ip2.run_code(_start_db_snippet)
            # only the first process that started mongodb should have it as a child
            assert MONGOD_EXE_NAME in get_child_process_names(
                process=ip1.process
            )
            assert MONGOD_EXE_NAME not in get_child_process_names(
                process=ip2.process
            )
            # ports should match
            assert ip1.run_code("db.port") == ip2.run_code("db.port")
            # DB should be reachable from both processes
            _check_db_connectivity(ip1)
            _check_db_connectivity(ip2)
            assert ip1.run_code(_list_datasets_snippet) == ip2.run_code(
                _list_datasets_snippet
            )
        finally:
            ip1.stop()
            ip2.stop()


@unittest.skip("Unstable, fix me")
def test_db_multi_client_cleanup():
    with cleanup_subprocesses(strict=True):
        ip1 = InteractiveSubprocess(autostart=True)
        ip2 = InteractiveSubprocess(autostart=True)
        try:
            ip1.run_code(_start_db_snippet)
            ip2.run_code(_start_db_snippet)
            # save a reference to the mongo process before killing ip1
            mongo_process = wait_for_subprocess_by_name(
                MONGOD_EXE_NAME, process=ip1.process
            )
            ip1.stop()
            # make sure mongo is still reachable
            assert mongo_process.is_running()
            assert MONGOD_EXE_NAME not in get_child_process_names(
                process=ip2.process
            )
            _check_db_connectivity(ip2)

            # make sure a new process can reach mongo
            ip1.start()
            ip1.run_code(_start_db_snippet)
            assert MONGOD_EXE_NAME not in get_child_process_names(
                process=ip1.process
            )
            _check_db_connectivity(ip1)
            assert ip1.run_code("db.port") == ip2.run_code("db.port")
            assert ip1.run_code("db.port") in fosu.get_listening_tcp_ports(
                mongo_process
            )

            # make sure mongodb exits only after both python processes exit
            ip2.stop()
            assert mongo_process.is_running()
            _check_db_connectivity(ip1)
            ip1.stop()
            # give it a small grace period to exit
            mongo_process.wait(timeout=1)
            assert not mongo_process.is_running()
        finally:
            ip1.stop()
            ip2.stop()


@unittest.skip("Unstable, fix me")
def test_db_cleanup():
    def _get_new_datasets(new_datasets, old_datasets):
        new_datasets = set(new_datasets) - set(old_datasets)
        assert len(new_datasets) == 1
        return list(new_datasets)[0]

    with cleanup_subprocesses(strict=True):
        with InteractiveSubprocess() as ip:
            ip.run_code(_start_db_snippet)
            orig_datasets = set(ip.run_code(_list_datasets_snippet))
            ip.run_code("d1 = fo.Dataset()")
            dataset_nonpersistent = _get_new_datasets(
                ip.run_code(_list_datasets_snippet), orig_datasets
            )
            ip.run_code("d2 = fo.Dataset(persistent=True)")
            dataset_persistent = _get_new_datasets(
                ip.run_code(_list_datasets_snippet),
                orig_datasets | {dataset_nonpersistent},
            )

        wait_for_mongod_exit()  # runs DatabaseService.cleanup()

        with InteractiveSubprocess() as ip:
            ip.run_code(_start_db_snippet)
            cur_datasets = set(ip.run_code(_list_datasets_snippet))
            assert cur_datasets == orig_datasets | {dataset_persistent}
            ip.run_code("d = fo.load_dataset(%r)" % dataset_persistent)
            ip.run_code("d.persistent = False")
            ip.run_code("d.save()")

        wait_for_mongod_exit()  # runs DatabaseService.cleanup()

        with InteractiveSubprocess() as ip:
            ip.run_code(_start_db_snippet)
            cur_datasets = set(ip.run_code(_list_datasets_snippet))
            assert cur_datasets == orig_datasets


if __name__ == "__main__":
    fo.config.show_progress_bars = False
    unittest.main(verbosity=2)
