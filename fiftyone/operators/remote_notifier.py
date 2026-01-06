"""
FiftyOne operator server SSE notifier for execution store events.

This module provides an SSE notifier that listens for notification requests
targeting a specific execution store. When a broadcast is sent to a store,
all connected SSE clients subscribed to that store will receive the message.

| Copyright 2017-2026, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""

import asyncio
import json
import logging
import time
from abc import ABC, abstractmethod
from typing import AsyncGenerator, Dict, Optional, Set, Tuple

from sse_starlette.sse import EventSourceResponse

logger = logging.getLogger(__name__)


class RemoteNotifier(ABC):
    @abstractmethod
    async def broadcast_to_store(self, store_name: str, message: str) -> None:
        """
        Broadcast a message to all remote subscribers of the given store.

        Args:
            store_name: The name of the store to which the message should be broadcast.
            message: The message payload to send to the subscribers.
        """
        pass


class SseNotifier(RemoteNotifier):
    """
    Handles the logic for broadcasting messages and managing client subscriptions
    for Server-Sent Events (SSE) notifications.
    """

    def __init__(self) -> None:
        # Maps store names to a set of tuples (queue, dataset_id)
        self.store_queues: Dict[
            str, Set[Tuple[asyncio.Queue, Optional[str]]]
        ] = {}

    async def broadcast_to_store(self, store_name: str, message: str) -> None:
        """
        Broadcast a message to all connected SSE clients subscribed to the specified store.
        Handles disconnected clients gracefully without raising exceptions.

        Args:
            store_name: The name of the store to broadcast to.
            message: The message to broadcast.
        """
        if store_name in self.store_queues:
            # Try to extract dataset_id from message for filtering
            dataset_id = None
            try:
                msg_data = json.loads(message)
                dataset_id = msg_data.get("metadata", {}).get("dataset_id")
            except Exception:
                # If we can't parse the message, continue without dataset filtering
                pass

            logger.debug(
                "Broadcasting message to store '%s'%s: %s",
                store_name,
                f" for dataset {dataset_id}" if dataset_id else "",
                message,
            )

            # Create a copy of the queues to avoid modification during iteration
            queue_items = list(self.store_queues[store_name])
            queues_to_remove = set()

            for queue, client_dataset_id in queue_items:
                # Filter by dataset_id if both are specified
                if (
                    client_dataset_id is not None
                    and dataset_id is not None
                    and dataset_id != client_dataset_id
                ):
                    continue

                try:
                    # Use put_nowait to avoid blocking on full queues
                    # This prevents one slow client from blocking others
                    queue.put_nowait(message)
                except asyncio.QueueFull:
                    logger.debug(
                        f"Queue full for client in store '{store_name}', dropping message"
                    )
                except Exception as e:
                    # If we encounter an error with this queue, mark it for removal
                    logger.debug(
                        f"Error sending to client in store '{store_name}': {e}"
                    )
                    queues_to_remove.add((queue, client_dataset_id))

            # Clean up any problematic queues
            for queue_item in queues_to_remove:
                self._unregister_queue(
                    store_name, queue_item[0], queue_item[1]
                )
        else:
            logger.debug(
                "No subscribers found for store '%s'. Message not sent.",
                store_name,
            )

    async def get_event_source_response(
        self, store_name: str, dataset_id: Optional[str] = None
    ) -> EventSourceResponse:
        """
        Creates an EventSourceResponse for a client subscribing to a specific store.
        It registers a new queue for the client and produces an async generator to stream events.

        Args:
            store_name: The name of the store to subscribe to.
            dataset_id: Optional dataset ID to filter events by.

        Returns:
            An EventSourceResponse for streaming events to the client.
        """
        queue: asyncio.Queue = asyncio.Queue()

        if store_name not in self.store_queues:
            self.store_queues[store_name] = set()
        self.store_queues[store_name].add((queue, dataset_id))

        logger.debug(
            "New SSE connection for store: %s%s",
            store_name,
            f" and dataset: {dataset_id}" if dataset_id else "",
        )
        logger.debug(
            "Total SSE connections for store %s: %s",
            store_name,
            len(self.store_queues.get(store_name, set())),
        )

        await self.sync_current_state_for_client(queue, store_name, dataset_id)

        async def event_generator() -> AsyncGenerator[str, None]:
            try:
                while True:
                    message = await queue.get()
                    yield message
                    queue.task_done()
            except asyncio.CancelledError:
                logger.debug(
                    "SSE client disconnected from store: %s", store_name
                )
            finally:
                self._unregister_queue(store_name, queue, dataset_id)
                logger.debug(
                    "Total SSE connections for store %s: %s",
                    store_name,
                    len(self.store_queues.get(store_name, set())),
                )

        return EventSourceResponse(event_generator())

    async def sync_current_state_for_client(
        self,
        queue: asyncio.Queue,
        store_name: str,
        dataset_id: Optional[str] = None,
    ) -> None:
        """
        Broadcast the current state of the store to all connected clients.
        """
        # note: unfortunate dependency on the notification service
        from fiftyone.operators.store.notification_service import (
            default_notification_service,
        )

        # wait until the notification service is started, with a timeout of 10 seconds
        start_time = time.time()
        while not default_notification_service.is_running:
            if time.time() - start_time > 10:
                raise TimeoutError(
                    "Notification service failed to start within 10 seconds"
                )
            await asyncio.sleep(0.5)

        asyncio.run_coroutine_threadsafe(
            default_notification_service._broadcast_current_state_for_store(
                store_name,
                dataset_id,
                lambda msg: queue.put_nowait(msg.to_json()),
            ),
            default_notification_service.dedicated_event_loop,
        )

    def _unregister_queue(
        self,
        store_name: str,
        queue: asyncio.Queue,
        dataset_id: Optional[str] = None,
    ) -> None:
        """
        Remove the client's queue from the store. Clean up if no queues remain.

        Args:
            store_name: The name of the store to unregister from.
            queue: The queue to unregister.
            dataset_id: Optional dataset ID associated with the queue.
        """
        if store_name in self.store_queues:
            self.store_queues[store_name].discard((queue, dataset_id))
            if not self.store_queues[store_name]:
                del self.store_queues[store_name]
                logger.debug(
                    "No more subscribers for store: %s. Cleaned up.",
                    store_name,
                )


default_sse_notifier = SseNotifier()
