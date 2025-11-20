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
        # Maps channel names to a set of tuples (queue, dataset_id)
        self.channel_queues: Dict[
            str, Set[Tuple[asyncio.Queue, Optional[str]]]
        ] = {}

    async def broadcast_to_channel(self, channel: str, message: str) -> None:
        """
        Broadcast a message to all connected SSE clients subscribed to the specified channel.
        Handles disconnected clients gracefully without raising exceptions.

        Args:
            channel: The name of the channel to broadcast to.
            message: The message to broadcast.
        """
        if channel in self.channel_queues:
            # Try to extract dataset_id from message for filtering
            dataset_id = None
            try:
                msg_data = json.loads(message)
                dataset_id = msg_data.get("metadata", {}).get("dataset_id")
            except Exception:
                # If we can't parse the message, continue without dataset filtering
                pass

            logger.debug(
                "Broadcasting message to channel '%s'%s: %s",
                channel,
                f" for dataset {dataset_id}" if dataset_id else "",
                message,
            )

            # Create a copy of the queues to avoid modification during iteration
            queue_items = list(self.channel_queues[channel])
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
                        f"Queue full for client in channel '{channel}', dropping message"
                    )
                except Exception as e:
                    # If we encounter an error with this queue, mark it for removal
                    logger.debug(
                        f"Error sending to client in channel '{channel}': {e}"
                    )
                    queues_to_remove.add((queue, client_dataset_id))

            # Clean up any problematic queues
            for queue_item in queues_to_remove:
                self._unregister_queue(channel, queue_item[0], queue_item[1])
        else:
            logger.debug(
                "No subscribers found for channel '%s'. Message not sent.",
                channel,
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
        queue: asyncio.Queue = asyncio.Queue()

        if channel not in self.channel_queues:
            self.channel_queues[channel] = set()
        self.channel_queues[channel].add((queue, dataset_id))

        logger.debug(
            "New SSE connection for channel: %s%s",
            channel,
            f" and dataset: {dataset_id}" if dataset_id else "",
        )
        logger.debug(
            "Total SSE connections for channel %s: %s",
            channel,
            len(self.channel_queues.get(channel, set())),
        )

        await self.sync_current_state_for_client(
            queue, channel, dataset_id, collection_name
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
                self._unregister_queue(channel, queue, dataset_id)
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
    ) -> None:
        """
        Broadcast the current state of the channel to the connected client.
        """
        # Get the notification service from the manager
        from fiftyone.server.events.manager import (
            get_default_notification_manager,
        )

        manager = get_default_notification_manager()
        notification_service = manager.get_service(collection_name)

        if not notification_service:
            logger.warning(
                f"Notification service for collection '{collection_name}' not found in manager"
            )
            return

        # wait until the notification service is started, with a timeout of 10 seconds
        start_time = time.time()
        while not notification_service.is_running:
            if time.time() - start_time > 10:
                raise TimeoutError(
                    "Notification service failed to start within 10 seconds"
                )
            await asyncio.sleep(0.5)

        asyncio.run_coroutine_threadsafe(
            notification_service._broadcast_current_state_for_channel(
                channel,
                dataset_id,
                lambda msg: queue.put_nowait(msg.to_json()),
            ),
            notification_service.dedicated_event_loop,
        )

    def _unregister_queue(
        self,
        channel: str,
        queue: asyncio.Queue,
        dataset_id: Optional[str] = None,
    ) -> None:
        """
        Remove the client's queue from the channel. Clean up if no queues remain.

        Args:
            channel: The name of the channel to unregister from.
            queue: The queue to unregister.
            dataset_id: Optional dataset ID associated with the queue.
        """
        if channel in self.channel_queues:
            self.channel_queues[channel].discard((queue, dataset_id))
            if not self.channel_queues[channel]:
                del self.channel_queues[channel]
                logger.debug(
                    "No more subscribers for channel: %s. Cleaned up.",
                    channel,
                )


default_sse_notifier = SseNotifier()
