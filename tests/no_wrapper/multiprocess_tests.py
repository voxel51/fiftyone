"""
Multiprocess tests.

| Copyright 2017-2025, Voxel51, Inc.
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
        food.establish_db_conn(fo.config)
        port = food._connection_kwargs["port"]
        with multiprocessing.Pool(2, _check_process, [port]) as pool:
            for _ in pool.imap(_check_process, [port, port]):
                pass


def _check_process(port):
    assert "FIFTYONE_PRIVATE_DATABASE_PORT" in os.environ
    env_port = os.environ["FIFTYONE_PRIVATE_DATABASE_PORT"]
    assert port == int(env_port)
    food.establish_db_conn(fo.config)
    assert int(port) == food._connection_kwargs["port"]


class GetDbConnTests(unittest.TestCase):
    def test_get_db_conn(self):
        import fiftyone.core.odm as foo

        conn = foo.get_db_conn()
        self.assertIsNotNone(conn)
        conn.client.close()
        assert conn.client._closed == True
        # should be able to reconnect
        conn = foo.get_db_conn()
        assert conn.client._closed == False


if __name__ == "__main__":
    fo.config.show_progress_bars = False
    unittest.main(verbosity=2)
