"""
FiftyOne execution store related unit tests.

| Copyright 2017-2025, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""

from datetime import datetime
import time
import unittest
from unittest.mock import patch, MagicMock, ANY, Mock

from bson import ObjectId

from fiftyone.operators.store import ExecutionStoreService
from fiftyone.operators.store.models import KeyDocument
from fiftyone.factory.repo_factory import MongoExecutionStoreRepo
from fiftyone.operators.store import ExecutionStore


EPSILON = 0.1


class IsDateTime:
    def __eq__(self, other):
        return isinstance(other, datetime)


def assert_delta_seconds_approx(time_delta, seconds, epsilon=EPSILON):
    assert abs(time_delta.total_seconds() - seconds) < epsilon


class TestKeyDocument(unittest.TestCase):
    def test_get_expiration(self):
        ttl = 1
        now = datetime.utcnow()
        expiration = KeyDocument.get_expiration(ttl)
        time_delta = expiration - now
        assert_delta_seconds_approx(time_delta, ttl)
        assert isinstance(expiration, datetime)

    def test_get_expiration_none(self):
        ttl = None
        expiration = KeyDocument.get_expiration(ttl)
        assert expiration is None


class ExecutionStoreServiceIntegrationTests(unittest.TestCase):
    def setUp(self) -> None:
        self.mock_collection = MagicMock()
        self.store_repo = MongoExecutionStoreRepo(self.mock_collection)
        self.store_service = ExecutionStoreService(self.store_repo)

    def test_set_key(self):
        store = "widgets"
        key = "widget_1"
        value = {"name": "Widget One", "value": 100}
        ttl = 60000

        self.store_repo.set_key(store, key, value, ttl=ttl)

        self.mock_collection.update_one.assert_called_once()
        args, kwargs = self.mock_collection.update_one.call_args

        # Filter
        self.assertEqual(
            args[0],
            {
                "store_name": store,
                "key": key,
                "dataset_id": None,
            },
        )

        # Update
        update = args[1]
        self.assertIn("$set", update)
        self.assertIn("$setOnInsert", update)

        self.assertEqual(update["$set"]["value"], value)
        self.assertIsInstance(update["$set"]["updated_at"], datetime)

        insert = update["$setOnInsert"]
        self.assertEqual(insert["store_name"], store)
        self.assertEqual(insert["key"], key)
        self.assertIsInstance(insert["created_at"], datetime)
        self.assertIsInstance(insert["expires_at"], datetime)
        self.assertIsNone(insert["dataset_id"])
        self.assertEqual(insert["policy"], "evict")

        # Options
        self.assertEqual(kwargs, {"upsert": True})

    def test_get_key(self):
        self.mock_collection.find_one.return_value = {
            "store_name": "widgets",
            "key": "widget_1",
            "value": {"name": "Widget One", "value": 100},
            "dataset_id": None,
            "created_at": time.time(),
            "updated_at": time.time(),
            "expires_at": time.time() + 60000,
            "policy": "evict",
        }
        self.store_service.get_key(store_name="widgets", key="widget_1")
        self.mock_collection.find_one.assert_called_once()
        self.mock_collection.find_one.assert_called_with(
            {
                "store_name": "widgets",
                "key": "widget_1",
                "dataset_id": None,
            }
        )

    def test_create_store(self):
        self.store_repo.create_store("widgets")
        self.mock_collection.insert_one.assert_called_once()
        self.mock_collection.insert_one.assert_called_with(
            {
                "store_name": "widgets",
                "key": "__store__",
                "value": None,
                "created_at": IsDateTime(),
                "updated_at": None,
                "expires_at": None,
                "dataset_id": None,
                "policy": "persist",
            }
        )

    def test_delete_key(self):
        self.mock_collection.delete_one.return_value = Mock(deleted_count=1)
        self.store_repo.delete_key("widgets", "widget_1")
        self.mock_collection.delete_one.assert_called_once()
        self.mock_collection.delete_one.assert_called_with(
            {
                "store_name": "widgets",
                "key": "widget_1",
                "dataset_id": None,
            }
        )

    def test_update_ttl(self):
        self.mock_collection.update_one.return_value = Mock(modified_count=1)
        ttl_seconds = 60000
        expected_expiration = KeyDocument.get_expiration(ttl_seconds)
        self.store_repo.update_ttl("widgets", "widget_1", ttl_seconds)
        self.mock_collection.update_one.assert_called_once()

        actual_call = self.mock_collection.update_one.call_args
        actual_expires_at = actual_call[0][1]["$set"]["expires_at"]
        time_delta = expected_expiration - actual_expires_at
        assert_delta_seconds_approx(time_delta, 0, epsilon=0.0001)

    def test_delete_store(self):
        self.mock_collection.delete_many.return_value = Mock(deleted_count=1)
        self.store_repo.delete_store("widgets")
        self.mock_collection.delete_many.assert_called_once()
        self.mock_collection.delete_many.assert_called_with(
            {"store_name": "widgets", "dataset_id": None}
        )

    def test_list_keys(self):
        self.mock_collection.find.return_value = [
            {"store_name": "widgets", "key": "widget_1", "policy": "persist"},
            {"store_name": "widgets", "key": "widget_2", "policy": "persist"},
        ]
        keys = self.store_repo.list_keys("widgets")
        assert keys == ["widget_1", "widget_2"]
        self.mock_collection.find.assert_called_once()
        self.mock_collection.find.assert_called_with(
            {
                "store_name": "widgets",
                "key": {"$ne": "__store__"},
                "dataset_id": None,
            },
            {"key": 1},
        )


class TestExecutionStoreIntegration(unittest.TestCase):
    def setUp(self) -> None:
        self.mock_collection = MagicMock()
        self.store_repo = MongoExecutionStoreRepo(self.mock_collection)
        self.store_service = ExecutionStoreService(self.store_repo)
        self.store = ExecutionStore("mock_store", self.store_service)

    def test_set(self):
        key = "widget_1"
        value = {"name": "Widget One", "value": 100}
        ttl = 60000

        self.store.set(key, value, ttl=ttl)

        self.mock_collection.update_one.assert_called_once()
        args, kwargs = self.mock_collection.update_one.call_args

        # Filter
        self.assertEqual(
            args[0],
            {
                "store_name": "mock_store",
                "key": key,
                "dataset_id": None,
            },
        )

        # Update
        update = args[1]
        self.assertIn("$set", update)
        self.assertIn("$setOnInsert", update)

        self.assertEqual(update["$set"]["value"], value)
        self.assertIsInstance(update["$set"]["updated_at"], datetime)

        insert = update["$setOnInsert"]
        self.assertEqual(insert["store_name"], "mock_store")
        self.assertEqual(insert["key"], key)
        self.assertIsInstance(insert["created_at"], datetime)
        self.assertIsInstance(insert["expires_at"], datetime)
        self.assertIsNone(insert["dataset_id"])

        # Options
        self.assertEqual(kwargs, {"upsert": True})

    def test_get(self):
        self.mock_collection.find_one.return_value = {
            "store_name": "mock_store",
            "key": "widget_1",
            "value": {"name": "Widget One", "value": 100},
            "dataset_id": None,
            "created_at": time.time(),
            "updated_at": time.time(),
            "expires_at": time.time() + 60000,
        }
        value = self.store.get("widget_1")
        assert value == {"name": "Widget One", "value": 100}
        self.mock_collection.find_one.assert_called_once()

    def test_list_keys(self):
        self.mock_collection.find.return_value = [
            {"store_name": "mock_store", "key": "widget_1"},
            {"store_name": "mock_store", "key": "widget_2"},
        ]
        keys = self.store.list_keys()
        assert keys == ["widget_1", "widget_2"]
        self.mock_collection.find.assert_called_once()

    def test_delete(self):
        self.mock_collection.delete_one.return_value = Mock(deleted_count=1)
        deleted = self.store.delete("widget_1")
        assert deleted
        self.mock_collection.delete_one.assert_called_once()

    def test_clear(self):
        self.store.clear()
        self.mock_collection.delete_many.assert_called_once()


class ExecutionStoreServiceDatasetIdTests(unittest.TestCase):
    def setUp(self) -> None:
        self.mock_collection = MagicMock()
        self.dataset_id = ObjectId()
        self.store_repo = MongoExecutionStoreRepo(
            self.mock_collection, dataset_id=self.dataset_id
        )
        self.store_service = ExecutionStoreService(self.store_repo)

    def test_set_key_with_dataset_id(self):
        store = "widgets"
        key = "widget_1"
        value = {"name": "Widget One", "value": 100}
        ttl = 60000

        self.store_service.set_key(store, key, value, ttl=ttl)

        self.mock_collection.update_one.assert_called_once()
        args, kwargs = self.mock_collection.update_one.call_args

        # Filter
        self.assertEqual(
            args[0],
            {
                "store_name": store,
                "key": key,
                "dataset_id": self.dataset_id,
            },
        )

        # Update
        update = args[1]
        self.assertIn("$set", update)
        self.assertIn("$setOnInsert", update)

        self.assertEqual(update["$set"]["value"], value)
        self.assertIsInstance(update["$set"]["updated_at"], datetime)

        insert = update["$setOnInsert"]
        self.assertEqual(insert["store_name"], store)
        self.assertEqual(insert["key"], key)
        self.assertIsInstance(insert["created_at"], datetime)
        self.assertIsInstance(insert["expires_at"], datetime)
        self.assertEqual(insert["dataset_id"], self.dataset_id)
        self.assertEqual(insert["policy"], "evict")

        # Options
        self.assertEqual(kwargs, {"upsert": True})

    def test_get_key_with_dataset_id(self):
        self.mock_collection.find_one.return_value = {
            "store_name": "widgets",
            "key": "widget_1",
            "value": {"name": "Widget One", "value": 100},
            "created_at": time.time(),
            "updated_at": time.time(),
            "expires_at": time.time() + 60000,
            "dataset_id": self.dataset_id,
            "policy": "evict",
        }
        self.store_service.get_key("widgets", "widget_1")
        self.mock_collection.find_one.assert_called_once()
        self.mock_collection.find_one.assert_called_with(
            {
                "store_name": "widgets",
                "key": "widget_1",
                "dataset_id": self.dataset_id,
            }
        )

    def test_list_keys_with_dataset_id(self):
        self.store_service.list_keys("widgets")
        self.mock_collection.find.assert_called_once()
        self.mock_collection.find.assert_called_with(
            {
                "store_name": "widgets",
                "key": {"$ne": "__store__"},
                "dataset_id": self.dataset_id,
            },
            {"key": 1},
        )

    def test_delete_key_with_dataset_id(self):
        mock_result = MagicMock()
        mock_result.deleted_count = 1  # Simulate a successful deletion
        self.mock_collection.delete_one.return_value = mock_result

        deleted = self.store_service.delete_key("widgets", "widget_1")
        assert deleted

        self.mock_collection.delete_one.assert_called_once()
        self.mock_collection.delete_one.assert_called_with(
            {
                "store_name": "widgets",
                "key": "widget_1",
                "dataset_id": self.dataset_id,
            }
        )

    def test_create_store_with_dataset_id(self):
        self.store_service.create_store("widgets")
        self.mock_collection.insert_one.assert_called_once()
        self.mock_collection.insert_one.assert_called_with(
            {
                "store_name": "widgets",
                "key": "__store__",
                "value": None,
                "dataset_id": self.dataset_id,
                "created_at": IsDateTime(),
                "updated_at": None,
                "expires_at": None,
                "policy": "persist",
            }
        )

    def test_delete_store_with_dataset_id(self):
        self.store_service.delete_store("widgets")
        self.mock_collection.delete_many.assert_called_once()
        self.mock_collection.delete_many.assert_called_with(
            {"store_name": "widgets", "dataset_id": self.dataset_id}
        )

    def test_update_ttl_with_dataset_id(self):
        ttl_seconds = 60000
        expected_expiration = KeyDocument.get_expiration(ttl_seconds)
        mock_result = MagicMock()
        mock_result.modified_count = 1
        self.mock_collection.update_one.return_value = mock_result

        updated = self.store_service.update_ttl(
            "widgets", "widget_1", ttl_seconds
        )
        assert updated

        actual_call = self.mock_collection.update_one.call_args
        actual_query, actual_update = actual_call[0]

        assert actual_query == {
            "store_name": "widgets",
            "key": "widget_1",
            "dataset_id": self.dataset_id,
        }

        actual_expires_at = actual_update["$set"]["expires_at"]
        assert isinstance(actual_expires_at, datetime)

        time_delta = actual_expires_at - expected_expiration
        assert_delta_seconds_approx(
            time_delta, 0
        )  # Check that the time difference is within the allowed EPSILON

    def test_string_dataset_id_raises_exception(self):
        """Test that creating a MongoExecutionStoreRepo with a string dataset_id raises an exception."""
        mock_collection = MagicMock()
        string_dataset_id = "507f1f77bcf86cd799439011"
        
        with self.assertRaises(ValueError) as context:
            MongoExecutionStoreRepo(mock_collection, dataset_id=string_dataset_id)
        
        self.assertIn("dataset_id must be an ObjectId", str(context.exception))
