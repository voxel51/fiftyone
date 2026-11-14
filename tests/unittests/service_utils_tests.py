"""
FiftyOne service utilities unit tests.

| Copyright 2017-2026, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""

import subprocess
import sys
import tempfile
import time
import unittest
from unittest import mock

import psutil
import pymongo

import fiftyone.core.service as fos
import fiftyone.service.util as fosu


def _start_mongod(dbpath):
    args = [
        fos.DatabaseService.find_mongod(),
        "--dbpath",
        dbpath,
        "--port",
        "0",
        "--bind_ip",
        "127.0.0.1",
    ]
    if not sys.platform.startswith("win"):
        args.append("--nounixsocket")

    process = psutil.Popen(
        args, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL
    )

    deadline = time.time() + 60
    while time.time() < deadline:
        for port in fosu.get_listening_tcp_ports(process):
            return process, port

        time.sleep(0.1)

    process.kill()
    raise RuntimeError("mongod did not start listening")


class ShutdownMongodTests(unittest.TestCase):
    def setUp(self):
        self._processes = []
        tmp = tempfile.TemporaryDirectory(ignore_cleanup_errors=True)
        self.addCleanup(tmp.cleanup)
        self.dbpath = tmp.name

    def tearDown(self):
        for process in self._processes:
            try:
                process.kill()
                process.wait(timeout=60)
            except psutil.Error:
                pass

    def _start(self):
        process, port = _start_mongod(self.dbpath)
        self._processes.append(process)
        return process, port

    def test_document_counts_survive_shutdown(self):
        process, port = self._start()

        client = pymongo.MongoClient("127.0.0.1", port, directConnection=True)
        client.test.docs.insert_many([{"i": i} for i in range(5)])
        client.close()

        self.assertTrue(fosu.shutdown_mongod(process))
        self.assertFalse(process.is_running())

        # A database that is killed instead of shut down restarts with a
        # count of 0 for these documents
        _, port = self._start()

        client = pymongo.MongoClient("127.0.0.1", port, directConnection=True)
        self.assertEqual(client.test.docs.count_documents({}), 5)
        self.assertEqual(client.test.docs.estimated_document_count(), 5)
        client.close()

    def test_client_that_cannot_be_created(self):
        process, _ = self._start()

        with mock.patch.object(
            pymongo, "MongoClient", side_effect=RuntimeError("no threads")
        ):
            self.assertFalse(fosu.shutdown_mongod(process))

        self.assertTrue(process.is_running())

    def test_process_that_is_not_listening(self):
        process = psutil.Popen(
            [sys.executable, "-c", "import time; time.sleep(60)"]
        )
        self._processes.append(process)

        self.assertFalse(fosu.shutdown_mongod(process))
        self.assertTrue(process.is_running())


if __name__ == "__main__":
    unittest.main(verbosity=2)
