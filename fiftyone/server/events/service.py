"""
Notification service for MongoDB collections using Change Streams.

| Copyright 2017-2025, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""

import asyncio
import logging
import os
from abc import ABC, abstractmethod
from datetime import datetime, timezone
from typing import Any, Callable, Dict, Optional, Set, Tuple

from motor.motor_asyncio import AsyncIOMotorCollection, AsyncIOMotorDatabase
from pymongo.errors import OperationFailure

import fiftyone.core.odm as foo
from fiftyone.operators.message import MessageData
from fiftyone.operators.remote_notifier import RemoteNotifier
from fiftyone.server.events.subscription import (
    LocalSubscriptionRegistry,
    default_subscription_registry,
)

logger = logging.getLogger(__name__)

POLL_INTERVAL_SECONDS = int(
    os.getenv("FIFTYONE_EXECUTION_STORE_POLL_INTERVAL_SECONDS", 5)
)


class ChangeStreamNotificationService(ABC):
    """Abstract base class for change stream notification services."""

    @abstractmethod
    def subscribe(
        self,
        channel: str,
        callback: Callable[[str], None],
        dataset_id: Optional[str] = None,
    ) -> str:
        """Register a local subscriber for a specific channel.

        Args:
            channel: The name of the channel to subscribe to.
            callback: The callback to call when a change occurs.
            dataset_id: Optional dataset ID to filter changes by.

        Returns:
            The subscription id.
        """
        pass

    @abstractmethod
    def unsubscribe(self, subscription_id: str):
        """Unsubscribe local subscribers from a specific channel.

        Args:
            subscription_id: The subscription id to unsubscribe from.
        """
        pass

    @abstractmethod
    def unsubscribe_all(self, channel: str):
        """Unsubscribe from all changes in a channel.

        Args:
            channel (str): the name of the channel to unsubscribe from
        """
        pass

    @abstractmethod
    def notify(self, channel: str, message_data: MessageData) -> None:
        """Notify local subscribers and remote listeners of a change.

        Args:
            channel: The name of the channel that changed.
            message: The message to notify subscribers with.
        """
        pass

    @abstractmethod
    async def start(
        self, dedicated_event_loop: asyncio.AbstractEventLoop
    ) -> None:
        """Start watching for database changes."""
        pass

    @abstractmethod
    async def stop(self) -> None:
        """Stop watching for database changes."""
        pass


class PollingStrategy(ABC):
    """Abstract base class for polling strategies."""

    @abstractmethod
    async def poll(
        self,
        collection: AsyncIOMotorCollection,
        notify_callback: Callable[[str, MessageData], Any],
        last_poll_time: Optional[datetime],
    ) -> datetime:
        """Perform a poll and notify of changes.

        Args:
            collection: The mongo collection to poll.
            notify_callback: Callback to notify of changes (channel, message_data).
            last_poll_time: The time of the last poll.

        Returns:
            The time of the current poll.
        """
        pass


class MongoCollectionNotificationService(ChangeStreamNotificationService):
    def __init__(
        self,
        collection_name: str,
        message_builder: Callable[[Dict[str, Any]], Tuple[str, MessageData]],
        remote_notifier: RemoteNotifier = None,
        registry: LocalSubscriptionRegistry = None,
        polling_strategy: Optional[PollingStrategy] = None,
        initial_state_builder: Optional[
            Callable[[str, Optional[str]], Dict[str, Any]]
        ] = None,
    ):
        self._subscription_registry = (
            default_subscription_registry if registry is None else registry
        )
        self._remote_notifier = remote_notifier
        self._collection_name = collection_name
        self._message_builder = message_builder
        self._polling_strategy = polling_strategy
        self._initial_state_builder = initial_state_builder

        # we init this in start(), which runs in a dedicated event loop
        # init-ing it in ctor or in global might cause wrong binding
        self.dedicated_event_loop: Optional[asyncio.AbstractEventLoop] = None
        self._async_db: AsyncIOMotorDatabase = None
        self._collection_async: AsyncIOMotorCollection = None
        self._last_poll_time: datetime = None
        self.is_running: bool = False

        # Reference to running task
        self._task: Optional[asyncio.Task] = None

        # Event to signal the task to stop,
        # will be initialized in the start method
        self._stop_event = None

        self._background_tasks: Set[asyncio.Task] = set()

    def subscribe(
        self,
        channel: str,
        callback: Callable[[str], None],
        dataset_id: Optional[str] = None,
    ) -> str:
        """Register a local subscriber for a specific channel.

        Args:
            channel: The name of the channel to subscribe to.
            callback: The callback to call when a change occurs.
            dataset_id: Optional dataset ID to filter changes by.

        Returns:
            The subscription id.
        """
        log_message = f"Subscribing to channel {channel}"
        if dataset_id:
            log_message += f" for dataset {dataset_id}"
        logger.debug(log_message)

        subscription_id = self._subscription_registry.subscribe(
            channel, callback, dataset_id
        )

        # we need to broadcast the current state as soon as the subscriber
        # is registered, so that the subscriber has the latest state
        # of the store. otherwise, the subscriber will only receive
        # next state changes after the first change occurs

        if self.dedicated_event_loop is None:
            logger.warning(
                "Event loop for notification service is not set, "
                "cannot broadcast current state"
            )
        elif self._initial_state_builder:
            # note: subscribe is usually called from the main thread,
            # so we need to use asyncio.run_coroutine_threadsafe
            asyncio.run_coroutine_threadsafe(
                self._broadcast_current_state_for_channel(
                    channel, dataset_id, callback
                ),
                self.dedicated_event_loop,
            )

        return subscription_id

    def unsubscribe(self, subscription_id: str):
        """Unsubscribe from a specific channel.

        Args:
            subscription_id: The subscription id to unsubscribe from.
        """
        self._subscription_registry.unsubscribe(subscription_id)

    def unsubscribe_all(self, channel: str):
        """Unsubscribe from all changes in a channel.

        Args:
            channel (str): the name of the channel to unsubscribe from
        """
        self._subscription_registry.unsubscribe_all(channel)

    async def start(
        self, dedicated_event_loop: asyncio.AbstractEventLoop
    ) -> None:
        """Start watching the collection for changes using change streams or polling."""
        self.dedicated_event_loop = dedicated_event_loop

        self._stop_event = asyncio.Event()

        self._async_db = foo.get_async_db_conn()
        self._collection_async = self._async_db[self._collection_name]

        self._task = asyncio.create_task(self._run())

        try:
            await self._task
        except asyncio.CancelledError:
            logger.debug("Change stream/polling task cancelled.")

    async def notify(self, channel: str, message_data: MessageData) -> None:
        """
        Notify local subscribers and remote listeners of a change.
        Handles exceptions gracefully to prevent failures when clients disconnect.

        Args:
            channel: The name of the channel that changed
            message_data: The message data to notify subscribers with
        """
        try:
            # Get dataset_id for filtering
            message_dataset_id = message_data.metadata.dataset_id
        except Exception as e:
            logger.warning(f"Error accessing dataset_id for filtering: {e}")
            message_dataset_id = None

        # Notify local subscribers
        # snapshot to avoid concurrent mutations
        subscribers = list(
            self._subscription_registry.get_subscribers(
                channel=channel
            ).items()
        )

        for subscription_id, (callback, subscriber_dataset_id) in subscribers:
            # Filter by dataset_id if specified in the subscription
            if (
                subscriber_dataset_id is not None
                and message_dataset_id is not None
                and subscriber_dataset_id != message_dataset_id
            ):
                continue

            try:
                callback(message_data)
            except Exception as e:
                logger.warning(
                    f"Error notifying local subscriber {subscription_id}: {e}"
                )
                # Consider removing problematic subscribers
                try:
                    self._subscription_registry.unsubscribe(subscription_id)
                except Exception:
                    # If unsubscribe fails, just continue
                    pass

        # Notify remote listeners
        if self._remote_notifier:
            task = asyncio.create_task(
                self._remote_notifier.broadcast_to_channel(
                    channel, message_data.to_json()
                )
            )
            self._background_tasks.add(task)
            task.add_done_callback(self._background_tasks.discard)

    async def _run(self) -> None:
        """Run the change stream/polling task."""
        logger.debug(
            f"Starting change stream/polling task for {self._collection_name}"
        )
        self.is_running = True

        try:
            # First attempt to use change streams
            await self._run_change_stream()
        except OperationFailure:
            if self._polling_strategy:
                logger.warning(
                    f"Mongo change stream is not available for {self._collection_name}. Falling back to polling."
                )
                # Try polling as a fallback for any error
                await self._start_polling()
            else:
                logger.warning(
                    f"Mongo change stream is not available for "
                    f"{self._collection_name} and no polling strategy provided."
                )
                self.is_running = False

    async def _run_change_stream(self) -> None:
        """Run the change stream watcher."""
        # Watch all changes in the collection - filtering happens at subscriber level
        pipeline = []

        # full_document="updateLookup" is required to get the full document in the change stream
        # https://motor.readthedocs.io/en/stable/api-asyncio/asyncio_motor_change_stream.html
        async with self._collection_async.watch(
            pipeline, full_document="updateLookup"
        ) as stream:
            if self._stop_event and self._stop_event.is_set():
                return

            try:
                while stream.alive and (
                    not self._stop_event or not self._stop_event.is_set()
                ):
                    try:
                        change = await stream.next()

                        if change:
                            await self._handle_change(change)

                    except StopAsyncIteration:
                        break
                    except asyncio.CancelledError:
                        break
                    except Exception as e:
                        logger.exception(
                            f"Error processing change stream: {e}"
                        )
                        await asyncio.sleep(1)
            finally:
                await stream.close()

    async def _broadcast_current_state_for_channel(
        self,
        channel: str,
        dataset_id: Optional[str] = None,
        callback: Optional[Callable] = None,
    ) -> None:
        """Broadcast the current state for a specific channel to a single subscriber.

        Args:
            channel: The name of the channel to broadcast state for
            dataset_id: Optional dataset ID to filter by
            callback: The callback function to send messages to
        """
        if not callback or not self._initial_state_builder:
            return

        logger.debug(
            f"broadcasting current state for channel {channel} with dataset_id {dataset_id}"
        )

        query = self._initial_state_builder(channel, dataset_id)

        docs = await self._collection_async.find(query).to_list()
        for doc in docs:
            # Simulate an "initial" event for current state
            # by creating a fake change stream document
            fake_change = {
                "operationType": "insert",  # Treat initial state as inserts
                "fullDocument": doc,
                "wallTime": datetime.now(timezone.utc),
            }
            # Add documentKey if _id exists
            if "_id" in doc:
                fake_change["documentKey"] = {"_id": doc["_id"]}

            try:
                result = self._message_builder(fake_change)
                channel_name, message_data = result
                if channel_name != channel:
                    continue

                # Override metadata to indicate initial load
                message_data.metadata.operation_type = "initial"

                callback(message_data)
            except Exception as e:
                logger.warning(
                    f"Error sending initial state to subscriber: {e}"
                )
                # Don't break, try next doc
                continue

    async def stop(self) -> None:
        """Signal stop watching the collection for changes.
        Assume this is called from thread safe context.
        """
        if self._stop_event:
            self._stop_event.set()

        # Cancel all in-flight background tasks
        for task in self._background_tasks:
            task.cancel()
        await asyncio.gather(*self._background_tasks, return_exceptions=True)

        # Cancel the the main watcher/polling task
        if self._task is not None:
            self._task.cancel()
            try:
                await self._task
            except asyncio.CancelledError:
                pass

        self._subscription_registry.empty_subscribers()
        self.is_running = False

    async def _handle_change(self, change: dict) -> None:
        """
        Process a change document from MongoDB change stream.

        Args:
            change: The change document from MongoDB.
        """
        try:
            channel, message_data = self._message_builder(change)
            if not channel or not message_data:
                return

            # Directly notify subscribers with message_data
            await self.notify(channel, message_data)
        except Exception as e:
            logger.exception(f"Error handling change: {e}")

    async def _start_polling(self) -> None:
        """Fallback to polling the collection periodically
        if change streams are not available."""
        logger.debug("Starting polling-based notification service")

        while not self._stop_event or not self._stop_event.is_set():
            try:
                self._last_poll_time = await self._polling_strategy.poll(
                    self._collection_async,
                    self.notify,
                    self._last_poll_time,
                )
            except Exception as e:
                logger.exception(f"Error during polling: {e}")
                # If there's an error during polling, wait a bit before retrying
                if self._stop_event and self._stop_event.is_set():
                    break

            # Wait for the next polling interval
            try:
                await asyncio.sleep(POLL_INTERVAL_SECONDS)
            except asyncio.CancelledError:
                logger.debug("Polling task cancelled during sleep")
                break
