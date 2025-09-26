"""
Multiprocess tests.

| Copyright 2017-2025, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""
import unittest
from pymongo.errors import InvalidOperation

import fiftyone.core.odm as foo


class GetDbConnTests(unittest.TestCase):
    def test_get_db_conn(self):
        # initial connection
        conn = foo.get_db_conn()
        doc = conn.datasets.find_one({}, {"_id": 1})
        self.assertIsNotNone(doc)
        disconnected = False

        # close connection
        conn.client.close()
        self.assertTrue(conn.client._closed)
        try:
            conn.datasets.find_one({}, {"_id": 1})
        except InvalidOperation:
            disconnected = True
            doc = None
        self.assertTrue(disconnected)
        self.assertIsNone(doc)

        # should reconnect
        conn = foo.get_db_conn()
        doc = conn.datasets.find_one({}, {"_id": 1})
        self.assertFalse(conn.client._closed)
        self.assertIsNotNone(doc)


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
