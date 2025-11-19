"""
Unit tests for subscription registry.

| Copyright 2017-2025, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""

import threading
import unittest
from unittest.mock import Mock

from fiftyone.operators.store.subscription_registry import (
    InLocalMemorySubscriptionRegistry,
)


class TestInLocalMemorySubscriptionRegistry(unittest.TestCase):
    def setUp(self):
        """Set up a fresh registry instance before each test."""
        self.registry = InLocalMemorySubscriptionRegistry()
        self.callback1 = Mock()
        self.callback2 = Mock()

    def test_subscribe_new_store(self):
        """Test subscribing to a new store returns a valid subscription ID."""
        sub_id = self.registry.subscribe("store1", self.callback1)
        self.assertIsInstance(sub_id, str)
        self.assertTrue(len(sub_id) > 0)

        subscribers = self.registry.get_subscribers("store1")
        self.assertEqual(len(subscribers), 1)
        self.assertIn(sub_id, subscribers)
        self.assertEqual(subscribers[sub_id], (self.callback1, None))

    def test_subscribe_with_dataset_id(self):
        """Test subscribing with a dataset ID."""
        sub_id = self.registry.subscribe(
            "store1", self.callback1, "dataset123"
        )
        subscribers = self.registry.get_subscribers("store1")
        self.assertEqual(subscribers[sub_id], (self.callback1, "dataset123"))

    def test_multiple_subscriptions_same_store(self):
        """Test multiple subscriptions to the same store."""
        sub_id1 = self.registry.subscribe("store1", self.callback1)
        sub_id2 = self.registry.subscribe("store1", self.callback2)

        self.assertNotEqual(sub_id1, sub_id2)
        subscribers = self.registry.get_subscribers("store1")
        self.assertEqual(len(subscribers), 2)
        self.assertIn(sub_id1, subscribers)
        self.assertIn(sub_id2, subscribers)

    def test_unsubscribe_existing(self):
        """Test unsubscribing an existing subscription."""
        sub_id = self.registry.subscribe("store1", self.callback1)
        result = self.registry.unsubscribe(sub_id)

        self.assertTrue(result)
        subscribers = self.registry.get_subscribers("store1")
        self.assertNotIn(sub_id, subscribers)

    def test_unsubscribe_nonexistent(self):
        """Test unsubscribing a non-existent subscription."""
        result = self.registry.unsubscribe("nonexistent-id")
        self.assertFalse(result)

    def test_unsubscribe_all(self):
        """Test unsubscribing all subscriptions for a store."""
        self.registry.subscribe("store1", self.callback1)
        self.registry.subscribe("store1", self.callback2)
        self.registry.subscribe("store2", self.callback1)

        self.registry.unsubscribe_all("store1")
        store1_subs = self.registry.get_subscribers("store1")
        store2_subs = self.registry.get_subscribers("store2")

        self.assertEqual(len(store1_subs), 0)
        self.assertEqual(len(store2_subs), 1)

    def test_empty_subscribers(self):
        """Test emptying all subscribers."""
        self.registry.subscribe("store1", self.callback1)
        self.registry.subscribe("store2", self.callback2)

        self.registry.empty_subscribers()
        self.assertEqual(len(self.registry.get_subscribers("store1")), 0)
        self.assertEqual(len(self.registry.get_subscribers("store2")), 0)

    def test_get_subscribers_nonexistent_store(self):
        """Test getting subscribers for a non-existent store."""
        subscribers = self.registry.get_subscribers("nonexistent")
        self.assertEqual(subscribers, {})

    def test_thread_safety(self):
        """Test thread safety of subscription operations."""

        def subscribe_thread():
            for _ in range(50):
                self.registry.subscribe("store1", self.callback1)

        threads = [threading.Thread(target=subscribe_thread) for _ in range(5)]
        for t in threads:
            t.start()
        for t in threads:
            t.join()

        subscribers = self.registry.get_subscribers("store1")
        self.assertEqual(len(subscribers), 250)


if __name__ == "__main__":
    unittest.main()
