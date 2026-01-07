"""
FiftyOne operator server SSE notifier for real-time events.

This module provides an SSE notifier that listens for notification requests
targeting specific channels. When a broadcast is sent to a channel,
all connected SSE clients subscribed to that channel receive the message.

| Copyright 2017-2026, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""

import asyncio
import json
import logging
import threading
import time
from abc import ABC, abstractmethod
from typing import AsyncGenerator, Dict, Optional, Set, Tuple

from sse_starlette.sse import EventSourceResponse

from fiftyone.server.events.constants import get_startup_timeout_seconds

logger = logging.getLogger(__name__)


class RemoteNotifier(ABC):
    @abstractmethod
    async def broadcast_to_channel(self, channel: str, message: str) -> None:
        """
        Broadcast a message to all remote subscribers of the given channel.

        Args:
            channel: The name of the channel to which the message should be broadcast.
            message: The message payload to send to the subscribers.
        """
        pass


class SseNotifier(RemoteNotifier):
    """
    Handles the logic for broadcasting messages and managing client subscriptions
    for Server-Sent Events (SSE) notifications.
    """

    def __init__(self) -> None:
        # Maps channel names to a set of tuples (queue, dataset_id, loop)
        self.channel_queues: Dict[
            str,
            Set[
                Tuple[asyncio.Queue, Optional[str], asyncio.AbstractEventLoop]
            ],
        ] = {}
        self._lock = threading.Lock()

    async def broadcast_to_channel(self, channel: str, message: str) -> None:
        """
        Broadcast a message to all connected SSE clients subscribed to the specified channel.
        Handles disconnected clients gracefully without raising exceptions.

        Args:
            channel: The name of the channel to broadcast to.
            message: The message to broadcast.
        """
        # This method runs on the notification thread (background loop)
        with self._lock:
            if channel not in self.channel_queues:
                logger.debug(
                    "No subscribers found for channel '%s'. Message not sent.",
                    channel,
                )
                return

            # Create a copy of the queues to avoid modification during iteration
            queue_items = list(self.channel_queues[channel])

        # Try to extract dataset_id from message for filtering
        dataset_id = None
        try:
            msg_data = json.loads(message)
            dataset_id = msg_data.get("metadata", {}).get("dataset_id")
        except Exception:
            pass

        logger.debug(
            "Broadcasting message to channel '%s'%s: %s",
            channel,
            f" for dataset {dataset_id}" if dataset_id else "",
            message,
        )

        queues_to_remove = set()

        for queue, client_dataset_id, loop in queue_items:
            # Filter by dataset_id if both are specified
            if (
                client_dataset_id is not None
                and dataset_id is not None
                and dataset_id != client_dataset_id
            ):
                continue

            try:
                # Use loop.call_soon_threadsafe because queue belongs to 'loop'
                # but we are running on the notification service loop.
                loop.call_soon_threadsafe(queue.put_nowait, message)
            except Exception as e:
                # If we encounter an error with this queue, mark it for removal
                logger.debug(
                    f"Error sending to client in channel '{channel}': {e}"
                )
                queues_to_remove.add((queue, client_dataset_id, loop))

        # Clean up any problematic queues
        if queues_to_remove:
            with self._lock:
                for queue_item in queues_to_remove:
                    self._unregister_queue(
                        channel, queue_item[0], queue_item[1], queue_item[2]
                    )

    async def get_event_source_response(
        self,
        channel: str,
        dataset_id: Optional[str] = None,
        collection_name: str = "execution_store",
    ) -> EventSourceResponse:
        """
        Creates an EventSourceResponse for a client subscribing to a specific channel.
        It registers a new queue for the client and produces an async generator to stream events.

        Args:
            channel: The name of the channel to subscribe to.
            dataset_id: Optional dataset ID to filter events by.
            collection_name: The collection name to use for initial state sync.

        Returns:
            An EventSourceResponse for streaming events to the client.
        """
        # Capture the current loop (Main Loop)
        loop = asyncio.get_running_loop()
        queue: asyncio.Queue = asyncio.Queue()

        with self._lock:
            if channel not in self.channel_queues:
                self.channel_queues[channel] = set()
            self.channel_queues[channel].add((queue, dataset_id, loop))

        logger.debug(
            "New SSE connection for channel: %s%s",
            channel,
            f" and dataset: {dataset_id}" if dataset_id else "",
        )

        await self.sync_current_state_for_client(
            queue, channel, dataset_id, collection_name, loop
        )

        async def event_generator() -> AsyncGenerator[str, None]:
            try:
                while True:
                    message = await queue.get()
                    yield message
                    queue.task_done()
            except asyncio.CancelledError:
                logger.debug(
                    "SSE client disconnected from channel: %s", channel
                )
            finally:
                with self._lock:
                    self._unregister_queue(channel, queue, dataset_id, loop)
                    logger.debug(
                        "Total SSE connections for channel %s: %s",
                        channel,
                        len(self.channel_queues.get(channel, set())),
                    )

        return EventSourceResponse(event_generator())

    async def sync_current_state_for_client(
        self,
        queue: asyncio.Queue,
        channel: str,
        dataset_id: Optional[str] = None,
        collection_name: str = "execution_store",
        loop: Optional[asyncio.AbstractEventLoop] = None,
    ) -> None:
        """Broadcast the current state of the channel to the connected client.

        Args:
            queue: The asyncio queue to send messages to.
            channel: The channel to sync state for.
            dataset_id: Optional dataset ID to filter by.
            collection_name: The collection name to get the service for.
            loop: The event loop the queue belongs to.
        """
        from fiftyone.server.events.manager import (
            get_default_notification_manager,
        )

        if loop is None:
            loop = asyncio.get_running_loop()

        manager = get_default_notification_manager()
        notification_service = manager.get_service(collection_name)

        if not notification_service:
            logger.warning(
                "Notification service for collection '%s' not found in manager",
                collection_name,
            )
            return

        # Wait for notification service to start
        timeout = get_startup_timeout_seconds()
        start_time = time.time()
        while not notification_service.is_running:
            if time.time() - start_time > timeout:
                raise TimeoutError(
                    f"Notification service failed to start within {timeout} seconds"
                )
            await asyncio.sleep(0.5)

        def _thread_safe_put(msg):
            loop.call_soon_threadsafe(queue.put_nowait, msg.to_json())

        # Use the public broadcast_initial_state method
        asyncio.run_coroutine_threadsafe(
            notification_service.broadcast_initial_state(
                channel,
                dataset_id,
                _thread_safe_put,
            ),
            notification_service.dedicated_event_loop,
        )

    def _unregister_queue(
        self,
        channel: str,
        queue: asyncio.Queue,
        dataset_id: Optional[str] = None,
        loop: asyncio.AbstractEventLoop = None,
    ) -> None:
        """
        Remove the client's queue from the channel. Clean up if no queues remain.
        Assumes caller holds the lock or calls from thread-safe context (e.g. broadcast clean up).
        """
        if channel in self.channel_queues:
            # Handle potential missing loop in tuple if legacy (shouldn't happen with new code)
            # Tuple is (queue, dataset_id, loop)
            entry = (queue, dataset_id, loop)
            self.channel_queues[channel].discard(entry)
            if not self.channel_queues[channel]:
                del self.channel_queues[channel]
                logger.debug(
                    "No more subscribers for channel: %s. Cleaned up.",
                    channel,
                )


default_sse_notifier = SseNotifier()
