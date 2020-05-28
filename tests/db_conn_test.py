"""
Test if the fiftyone MongoDB server is available.

| Copyright 2017-2020, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""
import unittest

from pymongo import MongoClient
from pymongo.errors import ConnectionFailure


class TestDatabaseConnection(unittest.TestCase):
    def test_connection(self):
        """
        Test that two datasets with the same name are the same
        """
        import fiftyone  # starts the server!

        client = MongoClient()

        try:
            # The ismaster command is cheap and does not require auth.
            client.admin.command("ismaster")
        except ConnectionFailure:
            self.fail("Server not available")

        print("Server available!")


if __name__ == "__main__":
    unittest.main()
