"""
FiftyOne execution store related unit tests.

| Copyright 2017-2025, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""

import unittest

from bson import ObjectId

from fiftyone.factory.repos.execution_store import InMemoryExecutionStoreRepo
from fiftyone.factory.repos.execution_store import KeyPolicy


class TestInMemoryExecutionStoreRepo(unittest.TestCase):
    def setUp(self):
        self.dataset_id = ObjectId()
        self.repo = InMemoryExecutionStoreRepo(dataset_id=self.dataset_id)

    def test_create_and_get_store(self):
        store_name = "test_store"
        metadata = {"foo": "bar"}

        created_store = self.repo.create_store(store_name, metadata)
        self.assertEqual(created_store.store_name, store_name)
        self.assertEqual(created_store.value, metadata)
        self.assertEqual(created_store.dataset_id, self.dataset_id)

        # get the store back
        fetched_store = self.repo.get_store(store_name)
        self.assertIsNotNone(fetched_store)
        self.assertEqual(fetched_store.store_name, store_name)

    def test_has_store_list_and_count(self):
        store_name1 = "store1"
        store_name2 = "store2"
        self.repo.create_store(store_name1)
        self.repo.create_store(store_name2)
        self.assertTrue(self.repo.has_store(store_name1))
        self.assertTrue(self.repo.has_store(store_name2))
        stores = self.repo.list_stores()
        self.assertIn(store_name1, stores)
        self.assertIn(store_name2, stores)
        self.assertEqual(self.repo.count_stores(), 2)

    def test_delete_store(self):
        store_name = "delete_store"
        self.repo.create_store(store_name)
        deleted_count = self.repo.delete_store(store_name)
        self.assertEqual(deleted_count, 1)
        self.assertFalse(self.repo.has_store(store_name))

    def test_set_and_get_key(self):
        store_name = "key_store"
        key = "test_key"
        value = "value1"
        key_doc = self.repo.set_key(store_name, key, value, ttl=60)
        self.assertEqual(key_doc.key, key)
        self.assertEqual(key_doc.value, value)
        self.assertEqual(key_doc.store_name, store_name)
        self.assertEqual(key_doc.dataset_id, self.dataset_id)
        self.assertIsNotNone(key_doc.expires_at)
        self.assertEqual(key_doc.policy, KeyPolicy.EVICT)
        self.assertTrue(self.repo.has_key(store_name, key))
        fetched_key = self.repo.get_key(store_name, key)
        self.assertEqual(fetched_key.value, value)

    def test_update_ttl(self):
        store_name = "ttl_store"
        key = "ttl_key"
        value = "value2"
        key_doc = self.repo.set_key(store_name, key, value, ttl=60)
        old_expiration = key_doc.expires_at
        updated = self.repo.update_ttl(store_name, key, 120)
        self.assertTrue(updated)
        updated_key = self.repo.get_key(store_name, key)
        # Ensure that the expiration timestamp has been updated (allowing for slight time differences)
        self.assertNotEqual(updated_key.expires_at, old_expiration)
        self.assertEqual(updated_key.policy, "evict")

    def test_update_policy(self):
        store_name = "policy_store"
        key = "policy_key"
        value = "value3"
        # Set the key with no policy
        self.repo.set_key(store_name, key, value)
        self.assertTrue(self.repo.has_key(store_name, key))

        # Update the policy to EVICT
        self.repo.update_policy(store_name, key, policy="evict")
        self.assertTrue(self.repo.has_key(store_name, key))
        key_doc = self.repo.get_key(store_name, key)
        self.assertIsNotNone(key_doc)
        self.assertEqual(key_doc.policy, "evict")

    def test_ttl_implied_policy(self):
        store_name = "ttl_policy_store"
        key = "ttl_key"
        value = "value4"
        # Set the key with a TTL (implying EVICT policy)
        self.repo.set_key(store_name, key, value, ttl=60)
        key_doc = self.repo.get_key(store_name, key)
        self.assertEqual(key_doc.policy, "evict")

    def test_delete_key(self):
        store_name = "delete_key_store"
        key = "delete_key"
        self.repo.set_key(store_name, key, "value3", ttl=60)
        deleted = self.repo.delete_key(store_name, key)
        self.assertTrue(deleted)
        self.assertFalse(self.repo.has_key(store_name, key))

    def test_list_and_count_keys(self):
        store_name = "keys_store"
        keys = ["key1", "key2", "key3"]
        # Create the store explicitly so that __store__ is inserted.
        self.repo.create_store(store_name)
        for k in keys:
            self.repo.set_key(store_name, k, f"value_for_{k}", ttl=60)
        listed_keys = self.repo.list_keys(store_name)
        self.assertCountEqual(listed_keys, keys)
        self.assertEqual(self.repo.count_keys(store_name), len(keys))

    def test_cleanup(self):
        store_name = "cleanup_store"
        # Create a store and two keys.
        self.repo.create_store(store_name)
        self.repo.set_key(store_name, "key1", "value", ttl=60)
        self.repo.set_key(store_name, "key2", "value", ttl=60)
        deleted_count = self.repo.cleanup()
        # Expecting deletion of the __store__ document and both key documents.
        self.assertEqual(deleted_count, 3)
        self.assertFalse(self.repo.has_store(store_name))
        self.assertFalse(self.repo.has_key(store_name, "key1"))
        self.assertFalse(self.repo.has_key(store_name, "key2"))

    def test_global_operations(self):
        store_name = "global_store"
        # Create a store and set a key.
        self.repo.create_store(store_name)
        self.repo.set_key(store_name, "key_global", "global_value", ttl=60)
        self.assertTrue(self.repo.has_store_global(store_name))
        global_stores = self.repo.list_stores_global()
        self.assertTrue(any(s.store_name == store_name for s in global_stores))
        # Since we only have one store, count_stores_global should return 1.
        self.assertEqual(self.repo.count_stores_global(), 1)
        deleted_count = self.repo.delete_store_global(store_name)
        self.assertGreater(deleted_count, 0)
        self.assertFalse(self.repo.has_store_global(store_name))

    def test_clear_cache(self):
        store_name = "example_cache_store"
        key = "key_to_clear"
        self.repo.set_cache_key(store_name, key, "value_to_clear")
        self.assertTrue(self.repo.has_key(store_name, key))
        self.repo.clear_cache()
        self.assertFalse(self.repo.has_key(store_name, key))

    def test_clear_cache_with_store_name(self):
        store_name = "specific_cache_store"
        key = "key_to_clear_specific"
        self.repo.set_cache_key(store_name, key, "value_to_clear_specific")
        self.assertTrue(self.repo.has_key(store_name, key))
        self.repo.clear_cache(store_name)
        self.assertFalse(self.repo.has_key(store_name, key))
        key_count = self.repo.count_keys(store_name)
        self.assertEqual(
            key_count, 0, "Expected no keys to remain after clearing cache."
        )
