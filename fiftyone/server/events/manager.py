"""
Notification manager for fiftyone server.

| Copyright 2017-2025, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""

import asyncio
import logging
import threading
from typing import Any, Callable, Dict, Optional, Tuple

from fiftyone.operators.message import MessageData
from fiftyone.operators.remote_notifier import RemoteNotifier
from fiftyone.server.events.service import (
    MongoCollectionNotificationService,
    PollingStrategy,
)
from fiftyone.server.events.subscription import LocalSubscriptionRegistry

logger = logging.getLogger(__name__)


class NotificationManager:
    def __init__(self):
        self._services: Dict[str, MongoCollectionNotificationService] = {}
        self._sub_id_to_collection: Dict[str, str] = {}
        self._lock = threading.Lock()

        self._loop: Optional[asyncio.AbstractEventLoop] = None
        self._thread: Optional[threading.Thread] = None
        self._loop_ready = threading.Event()

    def start(self) -> None:
        """Start the notification manager in a dedicated thread."""
        if self._thread and self._thread.is_alive():
            return

        logger.info("Starting notification manager...")

        def run_loop():
            self._loop = asyncio.new_event_loop()
            asyncio.set_event_loop(self._loop)
            self._loop_ready.set()

            # Keep the loop running
            self._loop.run_forever()

        self._thread = threading.Thread(target=run_loop, daemon=True)
        self._thread.start()

        # Wait for loop to be ready
        self._loop_ready.wait()

        # Start existing services
        with self._lock:
            for service in self._services.values():
                self._start_service(service)

    def stop(self) -> None:
        """Stop the notification manager and all services."""
        if not self._loop:
            return

        logger.info("Stopping notification manager...")

        # Stop all services
        with self._lock:
            futures = []
            for service in self._services.values():
                futures.append(
                    asyncio.run_coroutine_threadsafe(
                        service.stop(), self._loop
                    )
                )

            # Wait for services to stop
            for fut in futures:
                try:
                    fut.result(timeout=5)
                except Exception:
                    pass

        # Stop loop
        if self._loop.is_running():
            self._loop.call_soon_threadsafe(self._loop.stop)

        if self._thread:
            self._thread.join(timeout=5)
            self._thread = None
            self._loop = None
            self._loop_ready.clear()

    def manage_collection(
        self,
        collection_name: str,
        message_builder: Callable[[Dict[str, Any]], Tuple[str, MessageData]],
        remote_notifier: Optional[RemoteNotifier] = None,
        registry: Optional[LocalSubscriptionRegistry] = None,
        polling_strategy: Optional[PollingStrategy] = None,
        initial_state_builder: Optional[
            Callable[[str, Optional[str]], Dict[str, Any]]
        ] = None,
    ) -> MongoCollectionNotificationService:
        """Register a collection to be watched."""
        with self._lock:
            if collection_name in self._services:
                return self._services[collection_name]

            service = MongoCollectionNotificationService(
                collection_name=collection_name,
                message_builder=message_builder,
                remote_notifier=remote_notifier,
                registry=registry,
                polling_strategy=polling_strategy,
                initial_state_builder=initial_state_builder,
            )
            self._services[collection_name] = service

            if self._loop and self._loop.is_running():
                self._start_service(service)

            return service

    def get_service(
        self, collection_name: str
    ) -> Optional[MongoCollectionNotificationService]:
        with self._lock:
            return self._services.get(collection_name)

    def _start_service(self, service: MongoCollectionNotificationService):
        asyncio.run_coroutine_threadsafe(service.start(self._loop), self._loop)

    def subscribe(
        self,
        collection_name: str,
        channel: str,
        callback: Callable[[MessageData], None],
        dataset_id: Optional[str] = None,
    ) -> str:
        """Subscribe to a channel in a managed collection."""
        with self._lock:
            service = self._services.get(collection_name)
            if not service:
                raise ValueError(
                    f"Collection {collection_name} is not managed"
                )

        # Subscribe (thread-safe via subscription registry)
        sub_id = service.subscribe(channel, callback, dataset_id)

        with self._lock:
            self._sub_id_to_collection[sub_id] = collection_name

        return sub_id

    def unsubscribe(self, subscription_id: str):
        """Unsubscribe by subscription ID."""
        with self._lock:
            collection_name = self._sub_id_to_collection.pop(
                subscription_id, None
            )
            if collection_name:
                service = self._services.get(collection_name)
                if service:
                    service.unsubscribe(subscription_id)


_default_manager = NotificationManager()


def get_default_notification_manager() -> NotificationManager:
    return _default_manager
