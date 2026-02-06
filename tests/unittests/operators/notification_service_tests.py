"""
Unit tests for the notification service.

| Copyright 2017-2026, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""

import asyncio
import datetime
import unittest
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from pymongo.errors import OperationFailure

from fiftyone.operators.message import MessageData, MessageMetadata
from fiftyone.operators.store.notification_service import (
    MongoChangeStreamNotificationService,
)


class TestMongoChangeStreamNotificationService(unittest.TestCase):
    def setUp(self):
        self.loop = asyncio.new_event_loop()
        asyncio.set_event_loop(self.loop)

        self.remote_notifier = MagicMock()
        self.remote_notifier.broadcast_to_store = AsyncMock()

        self.collection = MagicMock()
        self.db = MagicMock()
        self.db.__getitem__.return_value = self.collection

        with patch("fiftyone.core.odm.get_async_db_conn") as mock_get_db:
            mock_get_db.return_value = self.db
            self.notification_service = MongoChangeStreamNotificationService(
                collection_name="test_collection",
                remote_notifier=self.remote_notifier,
            )
            self.notification_service._collection_async = self.collection

    def tearDown(self):
        self.loop.close()

    def test_subscribe(self):
        callback = MagicMock()
        subscription_id = self.notification_service.subscribe(
            "test_store", callback, dataset_id="test_dataset"
        )

        self.assertIsNotNone(subscription_id)
        subscribers = (
            self.notification_service._subscription_registry.get_subscribers(
                "test_store"
            )
        )
        self.assertIn(subscription_id, subscribers)
        self.assertEqual(subscribers[subscription_id][0], callback)
        self.assertEqual(subscribers[subscription_id][1], "test_dataset")

    def test_unsubscribe(self):
        callback = MagicMock()
        subscription_id = self.notification_service.subscribe(
            "test_store", callback
        )

        self.notification_service.unsubscribe(subscription_id)

        subscribers = (
            self.notification_service._subscription_registry.get_subscribers(
                "test_store"
            )
        )
        self.assertNotIn(subscription_id, subscribers)

    def test_unsubscribe_all(self):
        callback1 = MagicMock()
        callback2 = MagicMock()

        self.notification_service.subscribe("test_store", callback1)
        self.notification_service.subscribe("test_store", callback2)

        self.notification_service.unsubscribe_all("test_store")

        subscribers = (
            self.notification_service._subscription_registry.get_subscribers(
                "test_store"
            )
        )
        self.assertEqual(len(subscribers), 0)

    def test_notify_with_dataset_id_filtering(self):
        # Subscribe with dataset_id filter
        callback1 = MagicMock()
        callback2 = MagicMock()
        self.notification_service.subscribe(
            "test_store", callback1, dataset_id="dataset1"
        )
        self.notification_service.subscribe(
            "test_store", callback2, dataset_id="dataset2"
        )

        # Notification for dataset1
        metadata = MessageMetadata(dataset_id="dataset1")
        message_data = MessageData(
            key="test_key", value="test_value", metadata=metadata
        )

        asyncio.run(
            self.notification_service.notify("test_store", message_data)
        )

        callback1.assert_called_once_with(message_data)
        callback2.assert_not_called()
        self.remote_notifier.broadcast_to_store.assert_called_once_with(
            "test_store", message_data.to_json()
        )

    def test_notify_without_dataset_id(self):
        # Subscribe without dataset_id filter
        callback = MagicMock()
        self.notification_service.subscribe("test_store", callback)

        # Notification without dataset_id
        metadata = MessageMetadata()
        message_data = MessageData(
            key="test_key", value="test_value", metadata=metadata
        )

        asyncio.run(
            self.notification_service.notify("test_store", message_data)
        )

        callback.assert_called_once_with(message_data)
        self.remote_notifier.broadcast_to_store.assert_called_once_with(
            "test_store", message_data.to_json()
        )


class TestMongoChangeStreamNotificationServiceAsync(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        self.remote_notifier = MagicMock()
        self.remote_notifier.broadcast_to_store = AsyncMock()

        self.collection = MagicMock()
        self.db = MagicMock()
        self.db.__getitem__.return_value = self.collection

        # Patch async DB connection getter used by the service
        # Initialize collection manually for testing
        self.get_db_patcher = patch("fiftyone.core.odm.get_async_db_conn")
        self.mock_get_db = self.get_db_patcher.start()
        self.addCleanup(self.get_db_patcher.stop)
        self.mock_get_db.return_value = self.db

        self.service = MongoChangeStreamNotificationService(
            collection_name="test_collection",
            remote_notifier=self.remote_notifier,
        )

        self.service._collection_async = self.collection

    async def test_handle_change_insert(self):
        callback = MagicMock()
        self.service.subscribe("test_store", callback)

        change = {
            "operationType": "insert",
            "fullDocument": {
                "store_name": "test_store",
                "dataset_id": "test_dataset",
                "key": "test_key",
                "value": "test_value",
            },
            "wallTime": datetime.datetime.now(),
        }

        await self.service._handle_change(change)
        await asyncio.gather(*self.service._background_tasks)

        callback.assert_called_once()
        called_message = callback.call_args[0][0]

        assert called_message.key == "test_key"
        assert called_message.value == "test_value"
        assert called_message.metadata.dataset_id == "test_dataset"
        assert called_message.metadata.operation_type == "insert"
        self.remote_notifier.broadcast_to_store.assert_awaited_once()
        

    async def test_handle_change_delete(self):
        callback = MagicMock()
        self.service.subscribe("test_store", callback)

        # Mock a delete operation where fullDocument is not available
        change = {
            "operationType": "delete",
            "documentKey": {
                "_id": {
                    "store_name": "test_store",
                    "dataset_id": "test_dataset",
                    "key": "test_key",
                }
            },
            "wallTime": datetime.datetime.now(),
        }

        await self.service._handle_change(change)
        await asyncio.gather(*self.service._background_tasks)

        callback.assert_called_once()
        called_message = callback.call_args[0][0]

        assert called_message.key == "test_key"
        assert called_message.value is None
        assert called_message.metadata.dataset_id == "test_dataset"
        assert called_message.metadata.operation_type == "delete"
        self.remote_notifier.broadcast_to_store.assert_awaited_once()

    async def test_run_with_change_stream(self):

        with patch.object(
            self.service, "_run_change_stream"
        ) as mock_run_change_stream:
            mock_run_change_stream.return_value = None

            task = asyncio.create_task(self.service._run())

            await asyncio.sleep(0.1)

            task.cancel()

            try:
                await task
            except asyncio.CancelledError:
                pass

            mock_run_change_stream.assert_called_once()

    async def test_run_with_fallback_to_polling(self):

        # Patch the _run method and check its calls
        with patch.object(
            self.service, "_run_change_stream"
        ) as mock_run_change_stream, patch.object(
            self.service, "_start_polling"
        ) as mock_start_polling:
            # Make _run_change_stream raise an exception to trigger fallback
            mock_run_change_stream.side_effect = OperationFailure(
                "Change stream not available"
            )

            # Make _start_polling just return a future that resolves immediately
            mock_start_polling.return_value = asyncio.Future()
            mock_start_polling.return_value.set_result(None)

            task = asyncio.create_task(self.service._run())

            await asyncio.sleep(0.1)

            task.cancel()

            try:
                await task
            except asyncio.CancelledError:
                pass

            # Verify that fallback to polling occurred
            mock_run_change_stream.assert_called_once()
            mock_start_polling.assert_called_once()

    async def test_poll(self):

        with patch.object(
            MongoChangeStreamNotificationService, "_get_current_stores"
        ) as mock_get_current_stores:
            # Setup
            mock_get_current_stores.return_value = ["test_store"]

            # Mock the collection's distinct method
            current_keys = {"key1", "key2", "key3"}
            self.collection.distinct = AsyncMock(return_value=current_keys)

            # Set up previous state
            self.service._last_poll_time = datetime.datetime.now(
                datetime.timezone.utc
            )
            self.service._last_keys = {"test_store": {"key1", "key2", "key4"}}

            # Mock find to return updated documents
            mock_cursor = MagicMock()
            mock_cursor.to_list = AsyncMock(
                return_value=[
                    {
                        "key": "key1",
                        "value": "value1",
                        "dataset_id": "dataset1",
                    },
                    {
                        "key": "key2",
                        "value": "value2",
                        "dataset_id": "dataset2",
                    },
                    {
                        "key": "key3",
                        "value": "value3",
                        "dataset_id": "dataset3",
                    },
                ]
            )
            self.collection.find.return_value = mock_cursor

            # Save the poll time to ensure it's the same one used in the query
            last_poll_time = self.service._last_poll_time

            # Add a small delay to ensure time passes between poll calls
            await asyncio.sleep(0.001)

            # Call the poll method
            await self.service._poll()

            # Verify distinct was called
            self.collection.distinct.assert_called_with(
                "key", {"store_name": "test_store"}
            )

            # Don't directly compare the query since timestamps may have microsecond differences
            assert self.collection.find.call_count == 1
            call_args = self.collection.find.call_args[0][0]
            assert call_args["store_name"] == "test_store"
            assert "$gt" in call_args["updated_at"]

            # Verify _last_keys was updated
            assert self.service._last_keys["test_store"] == current_keys

            # Verify _last_poll_time was updated
            assert self.service._last_poll_time is not None
            assert self.service._last_poll_time != last_poll_time
