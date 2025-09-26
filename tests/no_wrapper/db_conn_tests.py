"""
Multiprocess tests.

| Copyright 2017-2025, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""
import unittest
from pymongo.errors import InvalidOperation
import fiftyone as fo
import fiftyone.core.odm as foo


class GetDbConnTests(unittest.TestCase):
    def test_get_db_conn(self):
        # initial connection
        datasets = fo.list_datasets(glob_patt="unittest*")
        self.assertIsNotNone(datasets)

        # close connection
        conn = foo.get_db_conn()
        conn.client.close()
        self.assertTrue(conn.client._closed)

        # confirm closed
        try:
            list(conn.datasets.find({}, limit=1))
        except InvalidOperation:
            datasets = None
        self.assertIsNone(datasets)

        # should reconnect
        datasets = fo.list_datasets(glob_patt="unittest*")
        self.assertIsNotNone(datasets)
        conn = foo.get_db_conn()
        self.assertFalse(conn.client._closed)


class GetAsyncDbConnTests(unittest.TestCase):
    def test_get_async_db_conn(self):
        conn = foo.get_async_db_conn(use_global=True)
        self.assertIsNotNone(conn)

        # Check that the connection is open
        self.assertFalse(conn.delegate.client._closed)

        # Close the connection
        conn.delegate.client.close()
        self.assertTrue(conn.delegate.client._closed)

        # should reconnect
        conn = foo.get_async_db_conn(use_global=True)
        self.assertFalse(conn.delegate.client._closed)
