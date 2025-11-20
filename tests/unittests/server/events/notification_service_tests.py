"""
Unit tests for the generic notification service architecture.

| Copyright 2017-2025, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""

import asyncio
import datetime
import unittest
from unittest.mock import AsyncMock, MagicMock, patch, call

import pytest
from pymongo.errors import OperationFailure

from fiftyone.operators.message import MessageData, MessageMetadata
from fiftyone.server.events.service import (
    MongoCollectionNotificationService,
    PollingStrategy,
)
from fiftyone.server.events.manager import NotificationManager
from fiftyone.server.events.subscription import (
    InLocalMemorySubscriptionRegistry,
)
from fiftyone.server.events.execution_store import (
    execution_store_message_builder,
    execution_store_initial_state_builder,
    ExecutionStorePollingStrategy,
)


# Test helper: Simple message builder for arbitrary collections
def simple_message_builder(change):
    """Simple message builder that uses _id as channel."""
    doc = change.get("fullDocument", {})
    if not doc:
        # Handle deletes
        doc_id = change.get("documentKey", {}).get("_id", {})
        if isinstance(doc_id, dict):
            channel = doc_id.get("channel", "default")
        else:
            channel = "default"
        return channel, MessageData(
            key=str(doc_id),
            value=None,
            metadata=MessageMetadata(
                operation_type=change["operationType"],
                timestamp=change.get(
                    "wallTime", datetime.datetime.now()
                ).isoformat(),
            ),
        )

    channel = doc.get("channel", "default")
    return channel, MessageData(
        key=doc.get("_id", "unknown"),
        value=doc.get("data"),
        metadata=MessageMetadata(
            operation_type=change["operationType"],
            dataset_id=doc.get("dataset_id"),
            timestamp=change.get(
                "wallTime", datetime.datetime.now()
            ).isoformat(),
        ),
    )


def simple_initial_state_builder(channel, dataset_id=None):
    """Simple initial state builder."""
    query = {"channel": channel}
    if dataset_id:
        query["dataset_id"] = dataset_id
    return query


class TestMongoCollectionNotificationService(unittest.TestCase):
    """Tests for the generic collection notification service."""

    def setUp(self):
        self.loop = asyncio.new_event_loop()
        asyncio.set_event_loop(self.loop)

        self.remote_notifier = MagicMock()
        self.remote_notifier.broadcast_to_channel = AsyncMock()

        self.collection = MagicMock()
        self.db = MagicMock()
        self.db.__getitem__.return_value = self.collection

        with patch("fiftyone.core.odm.get_async_db_conn") as mock_get_db:
            mock_get_db.return_value = self.db
            self.notification_service = MongoCollectionNotificationService(
                collection_name="test_collection",
                message_builder=simple_message_builder,
                remote_notifier=self.remote_notifier,
            )
            self.notification_service._collection_async = self.collection

    def tearDown(self):
        self.loop.close()

    def test_subscribe(self):
        """Test subscribing to a channel."""
        callback = MagicMock()
        subscription_id = self.notification_service.subscribe(
            "test_channel", callback, dataset_id="test_dataset"
        )

        self.assertIsNotNone(subscription_id)
        subscribers = (
            self.notification_service._subscription_registry.get_subscribers(
                "test_channel"
            )
        )
        self.assertIn(subscription_id, subscribers)
        self.assertEqual(subscribers[subscription_id][0], callback)
        self.assertEqual(subscribers[subscription_id][1], "test_dataset")

    def test_unsubscribe(self):
        """Test unsubscribing from a channel."""
        callback = MagicMock()
        subscription_id = self.notification_service.subscribe(
            "test_channel", callback
        )

        self.notification_service.unsubscribe(subscription_id)

        subscribers = (
            self.notification_service._subscription_registry.get_subscribers(
                "test_channel"
            )
        )
        self.assertNotIn(subscription_id, subscribers)

    def test_unsubscribe_all(self):
        """Test unsubscribing all from a channel."""
        callback1 = MagicMock()
        callback2 = MagicMock()

        self.notification_service.subscribe("test_channel", callback1)
        self.notification_service.subscribe("test_channel", callback2)

        self.notification_service.unsubscribe_all("test_channel")

        subscribers = (
            self.notification_service._subscription_registry.get_subscribers(
                "test_channel"
            )
        )
        self.assertEqual(len(subscribers), 0)

    def test_notify_with_dataset_id_filtering(self):
        """Test that notify correctly filters by dataset_id."""
        callback1 = MagicMock()
        callback2 = MagicMock()
        self.notification_service.subscribe(
            "test_channel", callback1, dataset_id="dataset1"
        )
        self.notification_service.subscribe(
            "test_channel", callback2, dataset_id="dataset2"
        )

        metadata = MessageMetadata(dataset_id="dataset1")
        message_data = MessageData(
            key="test_key", value="test_value", metadata=metadata
        )

        with patch("asyncio.create_task"):
            asyncio.run(
                self.notification_service.notify("test_channel", message_data)
            )

        callback1.assert_called_once_with(message_data)
        callback2.assert_not_called()
        self.remote_notifier.broadcast_to_channel.assert_called_once_with(
            "test_channel", message_data.to_json()
        )

    def test_notify_without_dataset_id(self):
        """Test notify when no dataset_id filter is present."""
        callback = MagicMock()
        self.notification_service.subscribe("test_channel", callback)

        metadata = MessageMetadata()
        message_data = MessageData(
            key="test_key", value="test_value", metadata=metadata
        )

        with patch("asyncio.create_task"):
            asyncio.run(
                self.notification_service.notify("test_channel", message_data)
            )

        callback.assert_called_once_with(message_data)
        self.remote_notifier.broadcast_to_channel.assert_called_once_with(
            "test_channel", message_data.to_json()
        )

    def test_notify_multiple_channels(self):
        """Test that notifications are channel-specific."""
        callback_channel1 = MagicMock()
        callback_channel2 = MagicMock()

        self.notification_service.subscribe("channel1", callback_channel1)
        self.notification_service.subscribe("channel2", callback_channel2)

        metadata = MessageMetadata()
        message_data = MessageData(
            key="test_key", value="test_value", metadata=metadata
        )

        with patch("asyncio.create_task"):
            asyncio.run(
                self.notification_service.notify("channel1", message_data)
            )

        callback_channel1.assert_called_once_with(message_data)
        callback_channel2.assert_not_called()


@pytest.fixture
def event_loop():
    """Create an instance of the default event loop for each test case."""
    loop = asyncio.get_event_loop_policy().new_event_loop()
    yield loop
    loop.close()


class TestMongoCollectionNotificationServiceAsync:
    """Async tests for the notification service."""

    @pytest.fixture
    def notification_service(self, event_loop):
        remote_notifier = MagicMock()
        remote_notifier.broadcast_to_channel = AsyncMock()

        collection = MagicMock()
        db = MagicMock()
        db.__getitem__.return_value = collection

        with patch("fiftyone.core.odm.get_async_db_conn") as mock_get_db:
            mock_get_db.return_value = db
            notification_service = MongoCollectionNotificationService(
                collection_name="test_collection",
                message_builder=simple_message_builder,
                remote_notifier=remote_notifier,
            )
            notification_service._collection_async = collection
            yield notification_service, collection, remote_notifier

    @pytest.mark.asyncio
    async def test_handle_change_insert(self, notification_service):
        """Test handling an insert change event."""
        service, collection, remote_notifier = notification_service
        callback = MagicMock()
        service.subscribe("test_channel", callback)

        change = {
            "operationType": "insert",
            "fullDocument": {
                "channel": "test_channel",
                "_id": "doc123",
                "data": "test_value",
                "dataset_id": "test_dataset",
            },
            "wallTime": datetime.datetime.now(),
        }

        with patch("asyncio.create_task"):
            await service._handle_change(change)

        callback.assert_called_once()
        called_message = callback.call_args[0][0]

        assert called_message.key == "doc123"
        assert called_message.value == "test_value"
        assert called_message.metadata.dataset_id == "test_dataset"
        assert called_message.metadata.operation_type == "insert"

    @pytest.mark.asyncio
    async def test_handle_change_update(self, notification_service):
        """Test handling an update change event."""
        service, collection, remote_notifier = notification_service
        callback = MagicMock()
        service.subscribe("test_channel", callback)

        change = {
            "operationType": "update",
            "fullDocument": {
                "channel": "test_channel",
                "_id": "doc123",
                "data": "updated_value",
            },
            "wallTime": datetime.datetime.now(),
        }

        with patch("asyncio.create_task"):
            await service._handle_change(change)

        callback.assert_called_once()
        called_message = callback.call_args[0][0]
        assert called_message.metadata.operation_type == "update"

    @pytest.mark.asyncio
    async def test_handle_change_delete(self, notification_service):
        """Test handling a delete change event."""
        service, collection, remote_notifier = notification_service
        callback = MagicMock()
        service.subscribe("test_channel", callback)

        change = {
            "operationType": "delete",
            "documentKey": {
                "_id": {
                    "channel": "test_channel",
                }
            },
            "wallTime": datetime.datetime.now(),
        }

        with patch("asyncio.create_task"):
            await service._handle_change(change)

        callback.assert_called_once()
        called_message = callback.call_args[0][0]
        assert called_message.value is None
        assert called_message.metadata.operation_type == "delete"

    @pytest.mark.asyncio
    async def test_run_with_change_stream(self, notification_service):
        """Test that service attempts to run change streams first."""
        service, collection, remote_notifier = notification_service

        with patch.object(
            service, "_run_change_stream"
        ) as mock_run_change_stream:
            mock_run_change_stream.return_value = None

            task = asyncio.create_task(service._run())
            await asyncio.sleep(0.1)
            task.cancel()

            try:
                await task
            except asyncio.CancelledError:
                pass

            mock_run_change_stream.assert_called_once()

    @pytest.mark.asyncio
    async def test_run_with_fallback_to_polling(self, notification_service):
        """Test fallback to polling when change streams unavailable."""
        service, collection, remote_notifier = notification_service

        # Add a polling strategy
        service._polling_strategy = MagicMock(spec=PollingStrategy)
        service._polling_strategy.poll = AsyncMock()

        with patch.object(
            service, "_run_change_stream"
        ) as mock_run_change_stream, patch.object(
            service, "_start_polling"
        ) as mock_start_polling:
            mock_run_change_stream.side_effect = OperationFailure(
                "Change stream not available"
            )
            mock_start_polling.return_value = asyncio.Future()
            mock_start_polling.return_value.set_result(None)

            task = asyncio.create_task(service._run())
            await asyncio.sleep(0.1)
            task.cancel()

            try:
                await task
            except asyncio.CancelledError:
                pass

            mock_run_change_stream.assert_called_once()
            mock_start_polling.assert_called_once()


class TestExecutionStoreIntegration:
    """Tests for Execution Store-specific functionality."""

    @pytest.fixture
    def execution_store_service(self, event_loop):
        remote_notifier = MagicMock()
        remote_notifier.broadcast_to_channel = AsyncMock()

        collection = MagicMock()
        db = MagicMock()
        db.__getitem__.return_value = collection

        with patch("fiftyone.core.odm.get_async_db_conn") as mock_get_db:
            mock_get_db.return_value = db
            service = MongoCollectionNotificationService(
                collection_name="execution_store",
                message_builder=execution_store_message_builder,
                remote_notifier=remote_notifier,
                polling_strategy=ExecutionStorePollingStrategy(),
                initial_state_builder=execution_store_initial_state_builder,
            )
            service._collection_async = collection
            yield service, collection, remote_notifier

    @pytest.mark.asyncio
    async def test_execution_store_message_builder(
        self, execution_store_service
    ):
        """Test execution store message builder."""
        service, collection, remote_notifier = execution_store_service
        callback = MagicMock()
        service.subscribe("my_store", callback)

        change = {
            "operationType": "insert",
            "fullDocument": {
                "store_name": "my_store",
                "key": "my_key",
                "value": "my_value",
                "dataset_id": "dataset123",
            },
            "wallTime": datetime.datetime.now(),
        }

        with patch("asyncio.create_task"):
            await service._handle_change(change)

        callback.assert_called_once()
        called_message = callback.call_args[0][0]

        assert called_message.key == "my_key"
        assert called_message.value == "my_value"
        assert called_message.metadata.dataset_id == "dataset123"

    @pytest.mark.asyncio
    async def test_execution_store_initial_state_builder(
        self, execution_store_service
    ):
        """Test execution store initial state builder."""
        from bson import ObjectId

        # Test without dataset_id
        query = execution_store_initial_state_builder("my_store", None)
        assert query["store_name"] == "my_store"
        assert query["key"] == {"$ne": "__store__"}
        assert "dataset_id" not in query

        # Test with valid ObjectId
        valid_oid = ObjectId()
        query = execution_store_initial_state_builder(
            "my_store", str(valid_oid)
        )
        assert query["store_name"] == "my_store"
        assert query["key"] == {"$ne": "__store__"}
        assert "dataset_id" in query
        assert query["dataset_id"] == valid_oid

    @pytest.mark.asyncio
    async def test_execution_store_polling_strategy(
        self, execution_store_service
    ):
        """Test execution store polling strategy."""
        service, collection, remote_notifier = execution_store_service
        strategy = service._polling_strategy

        # Mock collection methods
        collection.distinct = AsyncMock(
            side_effect=[
                ["store1", "store2"],  # store_names
                ["key1", "key2"],  # current keys for store1
                ["key3"],  # current keys for store2
            ]
        )

        mock_cursor = MagicMock()
        mock_cursor.to_list = AsyncMock(return_value=[])
        collection.find.return_value = mock_cursor

        # First poll (initialize)
        last_poll_time = await strategy.poll(collection, service.notify, None)
        assert last_poll_time is not None
        assert "store1" in strategy._last_keys
        assert "store2" in strategy._last_keys


class TestNotificationManager:
    """Tests for the notification manager."""

    @pytest.fixture
    def manager(self):
        return NotificationManager()

    def test_manage_collection(self, manager):
        """Test registering a collection to watch."""
        with patch("fiftyone.core.odm.get_async_db_conn"):
            service = manager.manage_collection(
                collection_name="test_collection",
                message_builder=simple_message_builder,
            )

            assert service is not None
            assert manager.get_service("test_collection") == service

    def test_manage_collection_idempotent(self, manager):
        """Test that managing same collection twice returns same service."""
        with patch("fiftyone.core.odm.get_async_db_conn"):
            service1 = manager.manage_collection(
                collection_name="test_collection",
                message_builder=simple_message_builder,
            )
            service2 = manager.manage_collection(
                collection_name="test_collection",
                message_builder=simple_message_builder,
            )

            assert service1 is service2

    def test_get_service_not_found(self, manager):
        """Test getting a service that doesn't exist."""
        service = manager.get_service("nonexistent")
        assert service is None

    def test_subscribe_via_manager(self, manager):
        """Test subscribing through the manager."""
        with patch("fiftyone.core.odm.get_async_db_conn"):
            manager.manage_collection(
                collection_name="test_collection",
                message_builder=simple_message_builder,
            )

            callback = MagicMock()
            sub_id = manager.subscribe(
                "test_collection", "my_channel", callback
            )

            assert sub_id is not None
            assert sub_id in manager._sub_id_to_collection

    def test_unsubscribe_via_manager(self, manager):
        """Test unsubscribing through the manager."""
        with patch("fiftyone.core.odm.get_async_db_conn"):
            manager.manage_collection(
                collection_name="test_collection",
                message_builder=simple_message_builder,
            )

            callback = MagicMock()
            sub_id = manager.subscribe(
                "test_collection", "my_channel", callback
            )

            manager.unsubscribe(sub_id)
            assert sub_id not in manager._sub_id_to_collection

    def test_subscribe_to_unmanaged_collection(self, manager):
        """Test that subscribing to unmanaged collection raises error."""
        callback = MagicMock()

        with pytest.raises(ValueError, match="is not managed"):
            manager.subscribe("nonexistent", "channel", callback)


class TestLocalSubscriptionRegistry:
    """Tests for the subscription registry."""

    def test_subscribe(self):
        """Test subscribing to a channel."""
        registry = InLocalMemorySubscriptionRegistry()
        callback = MagicMock()

        sub_id = registry.subscribe("channel1", callback, "dataset1")

        assert sub_id is not None
        subscribers = registry.get_subscribers("channel1")
        assert sub_id in subscribers
        assert subscribers[sub_id][0] == callback
        assert subscribers[sub_id][1] == "dataset1"

    def test_unsubscribe(self):
        """Test unsubscribing."""
        registry = InLocalMemorySubscriptionRegistry()
        callback = MagicMock()

        sub_id = registry.subscribe("channel1", callback)
        result = registry.unsubscribe(sub_id)

        assert result is True
        subscribers = registry.get_subscribers("channel1")
        assert sub_id not in subscribers

    def test_unsubscribe_nonexistent(self):
        """Test unsubscribing a non-existent subscription."""
        registry = InLocalMemorySubscriptionRegistry()
        result = registry.unsubscribe("nonexistent")
        assert result is False

    def test_unsubscribe_all(self):
        """Test unsubscribing all from a channel."""
        registry = InLocalMemorySubscriptionRegistry()

        registry.subscribe("channel1", MagicMock())
        registry.subscribe("channel1", MagicMock())
        registry.subscribe("channel2", MagicMock())

        registry.unsubscribe_all("channel1")

        assert len(registry.get_subscribers("channel1")) == 0
        assert len(registry.get_subscribers("channel2")) == 1

    def test_empty_subscribers(self):
        """Test emptying all subscribers."""
        registry = InLocalMemorySubscriptionRegistry()

        registry.subscribe("channel1", MagicMock())
        registry.subscribe("channel2", MagicMock())

        registry.empty_subscribers()

        assert len(registry.get_subscribers("channel1")) == 0
        assert len(registry.get_subscribers("channel2")) == 0

    def test_thread_safety(self):
        """Test that registry is thread-safe."""
        import threading

        registry = InLocalMemorySubscriptionRegistry()
        results = []

        def subscribe_many():
            for i in range(100):
                sub_id = registry.subscribe(f"channel{i % 10}", MagicMock())
                results.append(sub_id)

        threads = [threading.Thread(target=subscribe_many) for _ in range(10)]
        for t in threads:
            t.start()
        for t in threads:
            t.join()

        assert len(results) == 1000
        assert len(set(results)) == 1000  # All unique


class TestPollingStrategy:
    """Tests for custom polling strategies."""

    @pytest.mark.asyncio
    async def test_custom_polling_strategy(self):
        """Test implementing a custom polling strategy."""

        class CustomPollingStrategy(PollingStrategy):
            def __init__(self):
                self.poll_count = 0

            async def poll(self, collection, notify_callback, last_poll_time):
                self.poll_count += 1
                # Custom polling logic here
                return datetime.datetime.now(datetime.timezone.utc)

        strategy = CustomPollingStrategy()
        collection = MagicMock()
        notify_callback = AsyncMock()

        last_time = await strategy.poll(collection, notify_callback, None)
        assert last_time is not None
        assert strategy.poll_count == 1

        last_time = await strategy.poll(collection, notify_callback, last_time)
        assert strategy.poll_count == 2


class TestMessageBuilder:
    """Tests for message builder functions."""

    def test_simple_message_builder(self):
        """Test the simple message builder."""
        change = {
            "operationType": "insert",
            "fullDocument": {
                "channel": "test_channel",
                "_id": "doc123",
                "data": "test_data",
                "dataset_id": "dataset1",
            },
            "wallTime": datetime.datetime.now(),
        }

        channel, message = simple_message_builder(change)

        assert channel == "test_channel"
        assert message.key == "doc123"
        assert message.value == "test_data"
        assert message.metadata.dataset_id == "dataset1"

    def test_execution_store_message_builder(self):
        """Test the execution store message builder."""
        change = {
            "operationType": "update",
            "fullDocument": {
                "store_name": "my_store",
                "key": "my_key",
                "value": {"nested": "data"},
                "dataset_id": "dataset1",
            },
            "wallTime": datetime.datetime.now(),
        }

        channel, message = execution_store_message_builder(change)

        assert channel == "my_store"
        assert message.key == "my_key"
        assert message.value == {"nested": "data"}
        assert message.metadata.operation_type == "update"


class TestIntegrationScenarios:
    """End-to-end integration tests."""

    @pytest.mark.asyncio
    async def test_full_subscription_flow(self):
        """Test complete flow from manager to notification."""
        manager = NotificationManager()

        with patch("fiftyone.core.odm.get_async_db_conn"):
            # Register collection
            remote_notifier = MagicMock()
            remote_notifier.broadcast_to_channel = AsyncMock()

            service = manager.manage_collection(
                collection_name="test_collection",
                message_builder=simple_message_builder,
                remote_notifier=remote_notifier,
            )

            # Subscribe
            callback = MagicMock()
            sub_id = manager.subscribe(
                "test_collection", "my_channel", callback
            )

            # Simulate notification
            message = MessageData(
                key="key1",
                value="value1",
                metadata=MessageMetadata(operation_type="insert"),
            )

            with patch("asyncio.create_task"):
                await service.notify("my_channel", message)

            # Verify callback was called
            callback.assert_called_once_with(message)
            remote_notifier.broadcast_to_channel.assert_called_once()

            # Unsubscribe
            manager.unsubscribe(sub_id)

            # Verify unsubscribed
            callback.reset_mock()
            with patch("asyncio.create_task"):
                await service.notify("my_channel", message)

            callback.assert_not_called()
