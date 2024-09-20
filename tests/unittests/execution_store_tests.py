"""
FiftyOne execution store related unit tests.

| Copyright 2017-2024, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""

import time
import unittest
from unittest import mock
from unittest.mock import patch

import fiftyone
from bson import ObjectId

from fiftyone.operators.store import ExecutionStoreService
from fiftyone.operators.store.models import StoreDocument, KeyDocument
from fiftyone.operators.store.permissions import StorePermissions


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


if __name__ == "__main__":
    unittest.main()
