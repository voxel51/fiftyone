"""
FiftyOne execution store related unit tests.

| Copyright 2017-2024, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""

import time
import unittest
from unittest import mock
from unittest.mock import patch, MagicMock

import fiftyone
from bson import ObjectId

import fiftyone.operators as foo
from fiftyone.operators.store import ExecutionStoreService
from fiftyone.operators.store.models import StoreDocument, KeyDocument
from fiftyone.operators.store.permissions import StorePermissions
from fiftyone.factory.repo_factory import ExecutionStoreRepo
from fiftyone.operators.operator import Operator
from fiftyone.operators.store import ExecutionStoreService


class MockOperator:
    """Mock operator that interacts with ExecutionStore."""

    def __init__(self, ctx: foo.ExecutionContext):
        self.ctx = ctx

    def execute(self):
        # Example logic of interacting with the store
        store = self.ctx.create_store("widgets")

        # Set a value in the store
        store.set("widget_1", {"name": "Widget One", "value": 100}, ttl=60000)

        # Get the value back from the store
        result = store.get("widget_1")

        return result


class MockStoreRepo:
    def __init__(self):
        self.stores = {}

    def create_store(self, store_name, permissions=None):
        if isinstance(permissions, StorePermissions):
            permissions = permissions.dict()

        store = StoreDocument(store_name=store_name, permissions=permissions)
        self.stores[store_name] = store
        return store

    def set_key(self, store_name, key, value, ttl=None):
        store = self.stores.get(store_name)
        if store:
            key_doc = KeyDocument(key=key, value=value, ttl=ttl)
            store.keys[key] = key_doc
            return key_doc
        return None

    def get_key(self, store_name, key):
        store = self.stores.get(store_name)
        if store and key in store.keys:
            return store.keys[key]
        return None

    def delete_key(self, store_name, key):
        store = self.stores.get(store_name)
        if store and key in store.keys:
            del store.keys[key]

    def delete_store(self, store_name):
        if store_name in self.stores:
            del self.stores[store_name]

    def update_ttl(self, store_name, key, ttl):
        store = self.stores.get(store_name)
        if store and key in store.keys:
            store.keys[key].ttl = ttl
            return store.keys[key]
        return None


class ExecutionStoreServiceTests(unittest.TestCase):
    def setUp(self):
        # Mock repository and service for testing
        self.repo = MockStoreRepo()
        self.svc = ExecutionStoreService(repo=self.repo)

    def test_create_store(self):
        store_name = "test_store"
        permissions = StorePermissions.default()

        store = self.svc.create_store(
            store_name=store_name, permissions=permissions
        )

        self.assertIsNotNone(store)
        self.assertEqual(store.store_name, store_name)
        # Now compare the dictionary instead of the attribute
        self.assertEqual(store.permissions["roles"], permissions.roles)

    def test_set_and_get_key(self):
        store_name = "test_store"
        self.svc.create_store(store_name=store_name)

        key = "test_key"
        value = {"foo": "bar"}
        ttl = 10000

        key_doc = self.svc.set_key(
            store_name=store_name, key=key, value=value, ttl=ttl
        )
        self.assertIsNotNone(key_doc)
        self.assertEqual(key_doc.key, key)
        self.assertEqual(key_doc.value, value)
        self.assertEqual(key_doc.ttl, ttl)

        # Get the key and validate the value
        fetched_key_doc = self.svc.get_key(store_name=store_name, key=key)
        self.assertIsNotNone(fetched_key_doc)
        self.assertEqual(fetched_key_doc.key, key)
        self.assertEqual(fetched_key_doc.value, value)

    def test_delete_key(self):
        store_name = "test_store"
        self.svc.create_store(store_name=store_name)

        key = "test_key"
        value = {"foo": "bar"}
        self.svc.set_key(store_name=store_name, key=key, value=value)

        # Ensure the key exists
        key_doc = self.svc.get_key(store_name=store_name, key=key)
        self.assertIsNotNone(key_doc)

        # Delete the key
        self.svc.delete_key(store_name=store_name, key=key)

        # Ensure the key is deleted
        key_doc = self.svc.get_key(store_name=store_name, key=key)
        self.assertIsNone(key_doc)

    def test_update_ttl(self):
        store_name = "test_store"
        self.svc.create_store(store_name=store_name)

        key = "test_key"
        value = {"foo": "bar"}
        self.svc.set_key(store_name=store_name, key=key, value=value)

        # Update TTL
        new_ttl = 5000
        self.svc.update_ttl(store_name=store_name, key=key, new_ttl=new_ttl)

        # Fetch key and check updated TTL
        key_doc = self.svc.get_key(store_name=store_name, key=key)
        self.assertIsNotNone(key_doc)
        self.assertEqual(key_doc.ttl, new_ttl)

    def test_delete_store(self):
        store_name = "test_store"
        self.svc.create_store(store_name=store_name)

        # Ensure the store exists
        store = self.repo.stores.get(store_name)
        self.assertIsNotNone(store)

        # Delete the store
        self.svc.delete_store(store_name=store_name)

        # Ensure the store is deleted
        store = self.repo.stores.get(store_name)
        self.assertIsNone(store)

    def test_store_permissions(self):
        store_name = "test_store"
        permissions = StorePermissions.default()
        self.svc.create_store(store_name=store_name, permissions=permissions)

        # Check default permissions
        store = self.repo.stores.get(store_name)
        self.assertIsNotNone(store)
        # Now compare the dictionary instead of the attribute
        self.assertEqual(store.permissions["roles"], permissions.roles)


class TestOperatorWithExecutionStore(Operator):
    def execute(self, ctx):
        # Create a store and interact with it
        store = ctx.create_store("test_store")

        # Perform some store operations
        store.set("my_key", {"foo": "bar"})
        value = store.get("my_key")
        store.delete("my_key")

        return value


class ExecutionStoreIntegrationTests(unittest.TestCase):
    def setUp(self):
        # Create a MagicMock for the MongoDB collection
        self.mock_collection = MagicMock()

        # Instantiate the store repo and replace the _collection attribute
        self.store_repo = ExecutionStoreRepo(self.mock_collection)

        # Create the store service with the mocked repo
        self.store_service = ExecutionStoreService(self.store_repo)

        # Create an execution context
        from fiftyone.operators import ExecutionContext

        self.ctx = ExecutionContext()
        self.ctx.store_service = (
            self.store_service
        )  # Inject the store service into the context

        # Create an instance of the operator
        self.operator = TestOperatorWithExecutionStore()

    def test_operator_execute_with_store(self):
        # Mock MongoDB collection methods
        self.mock_collection.update_one.return_value = None
        self.mock_collection.find_one.return_value = {
            "key": "my_key",
            "value": {"foo": "bar"},
        }
        self.mock_collection.delete_one.return_value = None

        # Call the operator's execute method
        result = self.operator.execute(self.ctx)

        # Verify that the store interactions were made correctly
        self.mock_collection.update_one.assert_called_once()  # Checking that set operation inserts data
        self.mock_collection.find_one.assert_called_once_with(
            {"store_name": "test_store", "key": "my_key"}
        )  # Checking that get operation retrieves data
        self.mock_collection.delete_one.assert_called_once_with(
            {"store_name": "test_store", "key": "my_key"}
        )  # Checking that delete operation removes data

        # Verify the correct value was returned from the store
        self.assertEqual(result, {"key": "my_key", "value": {"foo": "bar"}})

    def test_operator_execute_set_key(self):
        # Mock the insert_one call for the set operation
        self.mock_collection.insert_one.return_value = None

        # Call the operator's execute method
        self.operator.execute(self.ctx)

        # Check that insert_one (set) was called with the correct arguments
        self.mock_collection.insert_one.assert_called_once_with(
            {
                "store_name": "test_store",
                "key": "my_key",
                "value": {"foo": "bar"},
            }
        )

    def test_operator_execute_get_key(self):
        # Mock the find_one call for the get operation
        self.mock_collection.find_one.return_value = {
            "key": "my_key",
            "value": {"foo": "bar"},
        }

        # Call the operator's execute method
        result = self.operator.execute(self.ctx)

        # Check that find_one (get) was called correctly and returned the expected value
        self.mock_collection.find_one.assert_called_once_with(
            {"store_name": "test_store", "key": "my_key"}
        )
        self.assertEqual(result, {"key": "my_key", "value": {"foo": "bar"}})

    def test_operator_execute_delete_key(self):
        # Mock the delete_one call for the delete operation
        self.mock_collection.delete_one.return_value = None

        # Call the operator's execute method
        self.operator.execute(self.ctx)

        # Check that delete_one was called with the correct arguments
        self.mock_collection.delete_one.assert_called_once_with(
            {"store_name": "test_store", "key": "my_key"}
        )
