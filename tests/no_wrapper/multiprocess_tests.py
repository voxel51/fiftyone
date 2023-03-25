"""
Multiprocess tests.

| Copyright 2017-2023, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""
import multiprocessing
import os
import unittest

import fiftyone as fo
import fiftyone.core.odm.database as food


class MultiprocessTest(unittest.TestCase):
    def test_multiprocessing(self):
        with multiprocessing.Pool(1, _check_process) as pool:
            for _ in pool.imap(_check_process, [None]):
                pass


def _check_process(*args):
    assert "FIFTYONE_PRIVATE_DATABASE_PORT" in os.environ
    port = os.environ["FIFTYONE_PRIVATE_DATABASE_PORT"]
    assert int(port) == food._connection_kwargs["port"]


if __name__ == "__main__":
    fo.config.show_progress_bars = False
    unittest.main(verbosity=2)
