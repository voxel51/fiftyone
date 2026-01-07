"""
Notification service for MongoDB collections using Change Streams.

| Copyright 2017-2025, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""

import asyncio
import logging
from abc import ABC, abstractmethod
from datetime import datetime, timezone
from typing import Any, Callable, Dict, Optional, Set, Tuple

from motor.motor_asyncio import AsyncIOMotorCollection
from pymongo.errors import OperationFailure

import fiftyone.core.odm as foo
from fiftyone.operators.message import MessageData
from fiftyone.operators.remote_notifier import RemoteNotifier
from fiftyone.server.events.constants import (
    OPERATION_TYPE_INITIAL,
    get_poll_interval_seconds,
)
from fiftyone.server.events.subscription import (
    LocalSubscriptionRegistry,
    SubscriptionCallback,
    default_subscription_registry,
)

logger = logging.getLogger(__name__)


class ChangeStreamNotificationService(ABC):
    """Abstract base class for change stream notification services."""

    @abstractmethod
    def subscribe(
        self,
        channel: str,
        callback: SubscriptionCallback,
        dataset_id: Optional[str] = None,
    ) -> str:
        """Register a local subscriber for a specific channel.

        Args:
            channel: The name of the channel to subscribe to.
            callback: The callback to call when a change occurs.
                Receives a MessageData object.
            dataset_id: Optional dataset ID to filter changes by.

        Returns:
            The subscription ID.
        """
        pass

    @abstractmethod
    def unsubscribe(self, subscription_id: str) -> None:
        """Unsubscribe a subscription by its ID.

        Args:
            subscription_id: The subscription ID to unsubscribe.
        """
        pass

    @abstractmethod
    def unsubscribe_all(self, channel: str) -> None:
        """Unsubscribe all subscriptions from a channel.

        Args:
            channel: The name of the channel to unsubscribe from.
        """
        pass

    @abstractmethod
    async def notify(self, channel: str, message_data: MessageData) -> None:
        """Notify local subscribers and remote listeners of a change.

        Args:
            channel: The name of the channel that changed.
            message_data: The message data to notify subscribers with.
        """
        pass

    @abstractmethod
    async def start(
        self, dedicated_event_loop: asyncio.AbstractEventLoop
    ) -> None:
        """Start watching for database changes.

        Args:
            dedicated_event_loop: The event loop to run the watcher on.
        """
        pass

    @abstractmethod
    async def stop(self) -> None:
        """Stop watching for database changes."""
        pass

    @abstractmethod
    async def broadcast_initial_state(
        self,
        channel: str,
        dataset_id: Optional[str],
        callback: SubscriptionCallback,
    ) -> None:
        """Broadcast the current state to a single subscriber.

        This is a public method for initial state synchronization.

        Args:
            channel: The channel to broadcast state for.
            dataset_id: Optional dataset ID to filter by.
            callback: The callback to send messages to.
        """
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
            collection: The MongoDB collection to poll.
            notify_callback: Async callback to notify of changes.
                Called with (channel, message_data).
            last_poll_time: The time of the last poll, or None for first poll.

        Returns:
            The timestamp of this poll (to be used as last_poll_time next time).
        """
        pass


# Type alias for message builder function
MessageBuilder = Callable[
    [Dict[str, Any]], Tuple[Optional[str], Optional[MessageData]]
]

# Type alias for initial state builder function
InitialStateBuilder = Callable[[str, Optional[str]], Dict[str, Any]]


class MongoCollectionNotificationService(ChangeStreamNotificationService):
    """Notification service that watches a MongoDB collection for changes.

    Uses MongoDB Change Streams when available, with polling fallback.
    """

    def __init__(
        self,
        collection_name: str,
        message_builder: MessageBuilder,
        remote_notifier: Optional[RemoteNotifier] = None,
        registry: Optional[LocalSubscriptionRegistry] = None,
        polling_strategy: Optional[PollingStrategy] = None,
        initial_state_builder: Optional[InitialStateBuilder] = None,
    ):
        """Initialize the notification service.

        Args:
            collection_name: The MongoDB collection to watch.
            message_builder: Function to transform change documents into
                (channel, MessageData) tuples.
            remote_notifier: Optional notifier for remote (SSE) subscribers.
            registry: Optional subscription registry. Uses default if not provided.
            polling_strategy: Optional strategy for polling fallback.
            initial_state_builder: Optional function to build queries for
                initial state sync.
        """
        self._subscription_registry = (
            default_subscription_registry if registry is None else registry
        )
        self._remote_notifier = remote_notifier
        self._collection_name = collection_name
        self._message_builder = message_builder
        self._polling_strategy = polling_strategy
        self._initial_state_builder = initial_state_builder

        # Initialized in start(), which runs in a dedicated event loop.
        # Initializing here or globally might cause incorrect loop binding.
        self.dedicated_event_loop: Optional[asyncio.AbstractEventLoop] = None
        self._collection_async: Optional[AsyncIOMotorCollection] = None
        self._last_poll_time: Optional[datetime] = None
        self.is_running: bool = False

        # Reference to running task
        self._task: Optional[asyncio.Task] = None

        # Event to signal the task to stop (initialized in start())
        self._stop_event: Optional[asyncio.Event] = None

        self._background_tasks: Set[asyncio.Task] = set()

    def subscribe(
        self,
        channel: str,
        callback: SubscriptionCallback,
        dataset_id: Optional[str] = None,
    ) -> str:
        """Register a local subscriber for a specific channel.

        Args:
            channel: The name of the channel to subscribe to.
            callback: The callback to call when a change occurs.
            dataset_id: Optional dataset ID to filter changes by.

        Returns:
            The subscription ID.
        """
        logger.debug(
            "Subscribing to channel %s%s",
            channel,
            f" for dataset {dataset_id}" if dataset_id else "",
        )

        subscription_id = self._subscription_registry.subscribe(
            channel, callback, dataset_id
        )

        # Broadcast current state immediately so subscriber has latest state.
        # Otherwise, subscriber only receives changes after the first change.
        if self.dedicated_event_loop is None:
            logger.warning(
                "Event loop for notification service is not set, "
                "cannot broadcast current state"
            )
        elif self._initial_state_builder:
            # subscribe is usually called from main thread,
            # so we need to use asyncio.run_coroutine_threadsafe
            asyncio.run_coroutine_threadsafe(
                self._broadcast_current_state_for_channel(
                    channel, dataset_id, callback
                ),
                self.dedicated_event_loop,
            )

        return subscription_id

    def unsubscribe(self, subscription_id: str) -> None:
        """Unsubscribe a subscription by its ID.

        Args:
            subscription_id: The subscription ID to unsubscribe.
        """
        self._subscription_registry.unsubscribe(subscription_id)

    def unsubscribe_all(self, channel: str) -> None:
        """Unsubscribe all subscriptions from a channel.

        Args:
            channel: The name of the channel to unsubscribe from.
        """
        self._subscription_registry.unsubscribe_all(channel)

    async def start(
        self, dedicated_event_loop: asyncio.AbstractEventLoop
    ) -> None:
        """Start watching the collection for changes.

        Uses change streams when available, with polling fallback.

        Args:
            dedicated_event_loop: The event loop to run the watcher on.
        """
        self.dedicated_event_loop = dedicated_event_loop

        self._stop_event = asyncio.Event()

        async_db = foo.get_async_db_conn()
        self._collection_async = async_db[self._collection_name]

        self._task = asyncio.create_task(self._run())

        try:
            await self._task
        except asyncio.CancelledError:
            logger.debug("Change stream/polling task cancelled")

    async def notify(self, channel: str, message_data: MessageData) -> None:
        """Notify local subscribers and remote listeners of a change.

        Handles exceptions gracefully to prevent failures when clients disconnect.

        Args:
            channel: The name of the channel that changed.
            message_data: The message data to notify subscribers with.
        """
        try:
            # Get dataset_id for filtering
            message_dataset_id = message_data.metadata.dataset_id
        except Exception as e:
            logger.warning("Error accessing dataset_id for filtering: %s", e)
            message_dataset_id = None

        # Snapshot to avoid concurrent mutations
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
                    "Error notifying local subscriber %s: %s",
                    subscription_id,
                    e,
                )
                # Remove problematic subscribers
                try:
                    self._subscription_registry.unsubscribe(subscription_id)
                except Exception:
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
            "Starting change stream/polling task for %s", self._collection_name
        )
        self.is_running = True

        try:
            # First attempt to use change streams
            await self._run_change_stream()
        except OperationFailure:
            if self._polling_strategy:
                logger.warning(
                    "Mongo change stream is not available for %s. "
                    "Falling back to polling.",
                    self._collection_name,
                )
                await self._start_polling()
            else:
                logger.warning(
                    "Mongo change stream is not available for %s "
                    "and no polling strategy provided.",
                    self._collection_name,
                )
                self.is_running = False

    async def _run_change_stream(self) -> None:
        """Run the change stream watcher."""
        # Watch all changes - filtering happens at subscriber level
        pipeline: list = []

        # full_document="updateLookup" required to get full document in change stream
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
                            "Error processing change stream: %s", e
                        )
                        await asyncio.sleep(1)
            finally:
                await stream.close()

    async def _broadcast_current_state_for_channel(
        self,
        channel: str,
        dataset_id: Optional[str],
        callback: SubscriptionCallback,
    ) -> None:
        """Broadcast the current state for a channel to a single subscriber.

        Internal method - use broadcast_initial_state() for external calls.

        Args:
            channel: The name of the channel to broadcast state for.
            dataset_id: Optional dataset ID to filter by.
            callback: The callback function to send messages to.
        """
        if not self._initial_state_builder:
            return

        query = self._initial_state_builder(channel, dataset_id)

        # Allow initial_state_builder to return None to skip initial state sync
        if query is None:
            return

        logger.debug(
            "Broadcasting current state for channel %s with dataset_id %s",
            channel,
            dataset_id,
        )

        docs = await self._collection_async.find(query).to_list()
        for doc in docs:
            # Simulate an "initial" event by creating a synthetic change document
            fake_change: Dict[str, Any] = {
                "operationType": "insert",
                "fullDocument": doc,
                "wallTime": datetime.now(timezone.utc),
            }
            if "_id" in doc:
                fake_change["documentKey"] = {"_id": doc["_id"]}

            try:
                channel_name, message_data = self._message_builder(fake_change)
                if channel_name != channel or message_data is None:
                    continue

                # Override operation type to indicate initial load
                message_data.metadata.operation_type = OPERATION_TYPE_INITIAL

                callback(message_data)
            except Exception as e:
                logger.warning(
                    "Error sending initial state to subscriber: %s", e
                )
                continue

    async def broadcast_initial_state(
        self,
        channel: str,
        dataset_id: Optional[str],
        callback: SubscriptionCallback,
    ) -> None:
        """Broadcast the current state to a single subscriber.

        Public method for initial state synchronization, typically used
        by SSE endpoints for new client connections.

        Args:
            channel: The channel to broadcast state for.
            dataset_id: Optional dataset ID to filter by.
            callback: The callback to send messages to.
        """
        await self._broadcast_current_state_for_channel(
            channel, dataset_id, callback
        )

    async def stop(self) -> None:
        """Stop watching the collection for changes.

        This method is thread-safe and can be called from any context.
        """
        if self._stop_event:
            self._stop_event.set()

        # Cancel all in-flight background tasks
        for task in self._background_tasks:
            task.cancel()
        await asyncio.gather(*self._background_tasks, return_exceptions=True)

        # Cancel the main watcher/polling task
        if self._task is not None:
            self._task.cancel()
            try:
                await self._task
            except asyncio.CancelledError:
                pass

        self._subscription_registry.empty_subscribers()
        self.is_running = False

    async def _handle_change(self, change: Dict[str, Any]) -> None:
        """Process a change document from MongoDB change stream.

        Args:
            change: The change document from MongoDB.
        """
        try:
            channel, message_data = self._message_builder(change)
            if not channel or not message_data:
                return

            await self.notify(channel, message_data)
        except Exception as e:
            logger.exception("Error handling change: %s", e)

    async def _start_polling(self) -> None:
        """Fallback to polling when change streams are unavailable."""
        logger.debug("Starting polling-based notification service")

        poll_interval = get_poll_interval_seconds()

        while not self._stop_event or not self._stop_event.is_set():
            try:
                self._last_poll_time = await self._polling_strategy.poll(
                    self._collection_async,
                    self.notify,
                    self._last_poll_time,
                )
            except Exception as e:
                logger.exception("Error during polling: %s", e)
                if self._stop_event and self._stop_event.is_set():
                    break

            try:
                await asyncio.sleep(poll_interval)
            except asyncio.CancelledError:
                logger.debug("Polling task cancelled during sleep")
                break
