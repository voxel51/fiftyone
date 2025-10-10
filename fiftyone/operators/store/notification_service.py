"""
Notification service for ExecutionStore using MongoDB Change Streams.

| Copyright 2017-2025, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""

import asyncio
import logging
import os
from abc import ABC, abstractmethod
from datetime import datetime, timezone
from threading import Thread
from typing import Callable, Dict, List, Optional, Set

from bson import ObjectId
from motor.motor_asyncio import AsyncIOMotorCollection, AsyncIOMotorDatabase
from pymongo.errors import OperationFailure

import fiftyone.core.odm as foo
from fiftyone.operators.message import MessageData, MessageMetadata
from fiftyone.operators.remote_notifier import (
    RemoteNotifier,
    default_sse_notifier,
)
from fiftyone.operators.store.subscription_registry import (
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
        store_name: str,
        callback: Callable[[str], None],
        dataset_id: Optional[str] = None,
    ) -> str:
        """Register a local subscriber for a specific store.

        Args:
            store_name: The name of the store to subscribe to.
            callback: The callback to call when a change occurs.
            dataset_id: Optional dataset ID to filter changes by.

        Returns:
            The subscription id.
        """
        pass

    @abstractmethod
    def unsubscribe(self, subscription_id: str):
        """Unsubscribe local subscribers from a specific store.

        Args:
            subscription_id: The subscription id to unsubscribe from.
        """
        pass

    @abstractmethod
    def unsubscribe_all(self, store_name: str):
        """Unsubscribe from all changes in a store.

        Args:
            store_name (str): the name of the store to unsubscribe from
        """
        pass

    @abstractmethod
    def notify(self, store_name: str, message_data: MessageData) -> None:
        """Notify local subscribers and remote listeners of a change.

        Args:
            store_name: The name of the store that changed.
            message: The message to notify subscribers with.
        """
        pass

    @abstractmethod
    async def start(self) -> None:
        """Start watching for database changes."""
        pass

    @abstractmethod
    async def stop(self) -> None:
        """Stop watching for database changes."""
        pass


class MongoChangeStreamNotificationService(ChangeStreamNotificationService):
    def __init__(
        self,
        collection_name: str,
        remote_notifier: RemoteNotifier = None,
        registry: LocalSubscriptionRegistry = None,
    ):
        self._subscription_registry = (
            default_subscription_registry if registry is None else registry
        )
        self._remote_notifier = remote_notifier

        self._collection_name = collection_name

        # we init this in start(), which runs in a dedicated event loop
        # init-ing it in ctor or in global might cause wrong binding
        self.dedicated_event_loop: Optional[asyncio.AbstractEventLoop] = None
        self._async_db: AsyncIOMotorDatabase = None
        self._collection_async: AsyncIOMotorCollection = None
        self._last_poll_time: datetime = None
        self.is_running: bool = False

        # Track keys per store for polling
        self._last_keys: Dict[str, set] = {}

        # Reference to running task
        self._task: Optional[asyncio.Task] = None

        # Event to signal the task to stop,
        # will be initialized in the start method
        self._stop_event = None

        self._background_tasks: Set[asyncio.Task] = set()

    async def _get_current_stores(self) -> List[str]:
        return await self._collection_async.distinct("store_name")

    def subscribe(
        self,
        store_name: str,
        callback: Callable[[str], None],
        dataset_id: Optional[str] = None,
    ) -> str:
        """Register a local subscriber for a specific store.

        Args:
            store_name: The name of the store to subscribe to.
            callback: The callback to call when a change occurs.
            dataset_id: Optional dataset ID to filter changes by.

        Returns:
            The subscription id.
        """
        log_message = f"Subscribing to store {store_name}"
        if dataset_id:
            log_message += f" for dataset {dataset_id}"
        logger.debug(log_message)

        subscription_id = self._subscription_registry.subscribe(
            store_name, callback, dataset_id
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
        else:
            # note: subscribe is usually called from the main thread,
            # so we need to use asyncio.run_coroutine_threadsafe
            asyncio.run_coroutine_threadsafe(
                self._broadcast_current_state_for_store(
                    store_name, dataset_id, callback
                ),
                self.dedicated_event_loop,
            )

        return subscription_id

    def unsubscribe(self, subscription_id: str):
        """Unsubscribe from a specific store.

        Args:
            subscription_id: The subscription id to unsubscribe from.
        """
        self._subscription_registry.unsubscribe(subscription_id)

    def unsubscribe_all(self, store_name: str):
        """Unsubscribe from all changes in a store.

        Args:
            store_name (str): the name of the store to unsubscribe from
        """
        self._subscription_registry.unsubscribe_all(store_name)

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

    async def notify(self, store_name: str, message_data: MessageData) -> None:
        """
        Notify local subscribers and remote listeners of a change.
        Handles exceptions gracefully to prevent failures when clients disconnect.

        Args:
            store_name: The name of the store that changed
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
                store_name=store_name
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
                self._remote_notifier.broadcast_to_store(
                    store_name, message_data.to_json()
                )
            )
            self._background_tasks.add(task)
            task.add_done_callback(self._background_tasks.discard)

    async def _run(self) -> None:
        """Run the change stream/polling task."""
        logger.debug("Starting change stream/polling task")
        self.is_running = True

        try:
            # First attempt to use change streams
            await self._run_change_stream()
        except OperationFailure:
            logger.warning(
                f"Mongo change stream is not available. Falling back to polling."
            )
            # Try polling as a fallback for any error
            await self._start_polling()

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

    async def _broadcast_current_state_for_store(
        self,
        store_name: str,
        dataset_id: Optional[str] = None,
        callback: Optional[Callable] = None,
    ) -> None:
        """Broadcast the current state for a specific store to a single subscriber.

        Args:
            store_name: The name of the store to broadcast state for
            dataset_id: Optional dataset ID to filter by
            callback: The callback function to send messages to
        """
        if not callback:
            return

        logger.debug(
            f"broadcasting current state for store {store_name} with dataset_id {dataset_id}"
        )

        query = {
            "store_name": store_name,
            "key": {"$ne": "__store__"},
        }

        if dataset_id is not None:
            query["dataset_id"] = (
                ObjectId(dataset_id)
                if isinstance(dataset_id, str)
                else dataset_id
            )

        docs = await self._collection_async.find(query).to_list()
        for doc in docs:
            message_data = MessageData(
                key=doc["key"],
                value=doc["value"],
                metadata=MessageMetadata(
                    operation_type="initial",
                    dataset_id=(
                        str(doc.get("dataset_id"))
                        if doc.get("dataset_id") is not None
                        else None
                    ),
                    timestamp=datetime.now(timezone.utc).isoformat(),
                ),
            )
            try:
                callback(message_data)
            except Exception as e:
                logger.warning(
                    f"Error sending initial state to subscriber: {e}"
                )
                break

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
            # from mongodb docs:
            # https://www.mongodb.com/docs/manual/changeStreams/
            # and pymongo docs:
            # https://pymongo.readthedocs.io/en/stable/api/pymongo/change_stream.html
            #
            # operationType can be: insert/update/replace/delete
            # fullDocument is the most current majority-committed version of the document
            # documentKey contains a document _id (not the same as a full document)
            # updateDescription contains a description of the fields that were updated/removed (optional)

            operation_type = change["operationType"]

            # Get the store name from the document
            if "fullDocument" in change and change["fullDocument"]:
                store_name = change["fullDocument"].get("store_name")
                dataset_id = change["fullDocument"].get("dataset_id")
                key = change["fullDocument"].get("key")
                value = change["fullDocument"].get("value")
            else:
                # For delete operations, we need to use the document key
                # important todo: right now, we won't detect deletes
                # because we need to do a minor refactor to embed store_name
                # and dataset_id and key in the documentKey._id.
                # Right now, we'll know document is deleted but not
                # useful metadata about it
                doc_id = change["documentKey"].get("_id", {})
                if isinstance(doc_id, dict):
                    store_name = doc_id.get("store_name")
                    dataset_id = doc_id.get("dataset_id")
                    key = doc_id.get("key")
                    value = None
                else:
                    # If we can't get the store name, skip this change
                    return

            if not store_name:
                # If we can't get the store name, skip this change
                return

            time_of_change = change["wallTime"].isoformat()

            message_data = MessageData(
                key=key,
                value=value,
                metadata=MessageMetadata(
                    operation_type=operation_type,
                    dataset_id=(
                        str(dataset_id) if dataset_id is not None else None
                    ),
                    timestamp=time_of_change,
                ),
            )

            # Directly notify subscribers with message_data
            await self.notify(store_name, message_data)
        except Exception as e:
            logger.exception(f"Error handling change: {e}")

    async def _start_polling(self) -> None:
        """Fallback to polling the collection periodically
        if change streams are not available."""
        logger.debug("Starting polling-based notification service")

        while not self._stop_event or not self._stop_event.is_set():
            try:
                await self._poll()
            except Exception as e:
                logger.exception(f"Error during polling: {e}")
                # If there's an error during polling, wait a bit before retrying
                # to avoid rapid retries in case of persistent errors
                if self._stop_event and self._stop_event.is_set():
                    break

            # Wait for the next polling interval
            try:
                await asyncio.sleep(POLL_INTERVAL_SECONDS)
            except asyncio.CancelledError:
                logger.debug("Polling task cancelled during sleep")
                break

    async def _poll(self) -> None:
        """Check for changes since the last poll."""
        now = datetime.now(timezone.utc)
        store_names = await self._get_current_stores()

        if self._last_poll_time is None:
            self._last_poll_time = now

            for store_name in store_names:
                self._last_keys[store_name] = set(
                    await self._collection_async.distinct(
                        "key", {"store_name": store_name}
                    )
                )
            return

        for store_name in store_names:
            current_keys = set(
                await self._collection_async.distinct(
                    "key", {"store_name": store_name}
                )
            )
            previous_keys = self._last_keys.get(store_name, set())

            # Detect deleted keys
            deleted_keys = previous_keys - current_keys
            for key in deleted_keys:
                if key == "__store__":
                    continue
                message_data = MessageData(
                    key=key,
                    value=None,
                    metadata=MessageMetadata(
                        operation_type="delete",
                        dataset_id=None,
                        timestamp=datetime.now(timezone.utc).isoformat(),
                    ),
                )
                await self.notify(store_name, message_data)

            # Detect inserts and updates
            query = {
                "store_name": store_name,
                "updated_at": {"$gt": self._last_poll_time},
            }

            docs = await self._collection_async.find(query).to_list()
            for doc in docs:
                key = doc["key"]
                if key == "__store__":
                    continue
                value = doc["value"]
                dataset_id = doc.get("dataset_id")
                event = "insert" if key not in previous_keys else "update"

                message_data = MessageData(
                    key=key,
                    value=value,
                    metadata=MessageMetadata(
                        operation_type=event,
                        dataset_id=(
                            str(dataset_id) if dataset_id is not None else None
                        ),
                        timestamp=datetime.now(timezone.utc).isoformat(),
                    ),
                )
                await self.notify(store_name, message_data)

            self._last_keys[store_name] = current_keys
        self._last_poll_time = now


class MongoChangeStreamNotificationServiceLifecycleManager:
    def __init__(
        self, notification_service: MongoChangeStreamNotificationService
    ):
        self._notification_service = notification_service
        self._notification_service_loop: Optional[
            asyncio.AbstractEventLoop
        ] = None
        self._notification_thread: Optional[Thread] = None

    def start_in_dedicated_thread(self) -> None:
        """Create a dedicated event loop in a new thread
        and start the notification service."""
        if self._notification_thread and self._notification_thread.is_alive():
            logger.info("Notification service daemon already running")
            return

        logger.info("Starting execution store notification service daemon...")

        def run_service_in_thread():
            self._notification_service_loop = asyncio.new_event_loop()

            asyncio.set_event_loop(self._notification_service_loop)

            try:
                self._notification_service_loop.run_until_complete(
                    self._notification_service.start(
                        self._notification_service_loop
                    )
                )
            except Exception:
                logger.exception("Notification service failed to start")

        self._notification_thread = Thread(
            target=run_service_in_thread, daemon=True
        )
        self._notification_thread.start()

    async def stop(self) -> None:
        if (
            self._notification_service
            and not self._notification_service_loop.is_closed()
        ):
            try:
                logger.info("Stopping notification service gracefully")

                fut = asyncio.run_coroutine_threadsafe(
                    self._notification_service.stop(),
                    self._notification_service_loop,
                )
                fut.result(timeout=5)
            except Exception:
                logger.exception(
                    "Failed to stop notification service gracefully"
                )
            finally:
                self._notification_thread.join(timeout=5)

                if self._notification_thread.is_alive():
                    logger.warning(
                        "Notification thread did not stop; forcing exit"
                    )

                try:
                    self._notification_service_loop.close()
                except Exception as e:
                    logger.warning(
                        f"Failed to close notification service loop: {e}"
                    )

        self._notification_service_loop = None
        self._notification_thread = None

        logger.info("Notification service stopped!")


def is_notification_service_disabled() -> bool:
    """Check if the notification service is disabled."""
    return (
        os.getenv(
            "FIFTYONE_EXECUTION_STORE_NOTIFICATION_SERVICE_DISABLED", "false"
        ).lower()
        == "true"
    )


default_notification_service = MongoChangeStreamNotificationService(
    collection_name="execution_store",
    remote_notifier=default_sse_notifier,
)
