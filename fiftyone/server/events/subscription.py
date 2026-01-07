"""
Subscription registry class.

| Copyright 2017-2025, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""

import logging
import threading
import uuid
from abc import ABC, abstractmethod
from typing import Callable, Dict, Optional, Tuple, TYPE_CHECKING

if TYPE_CHECKING:
    from fiftyone.operators.message import MessageData

logger = logging.getLogger(__name__)

# Type alias for subscription callback
SubscriptionCallback = Callable[["MessageData"], None]


class LocalSubscriptionRegistry(ABC):
    """Abstract base class for subscription registry."""

    @abstractmethod
    def subscribe(
        self,
        channel: str,
        callback: SubscriptionCallback,
        dataset_id: Optional[str] = None,
    ) -> str:
        """Register a subscription for a given channel.

        Args:
            channel: The name of the channel to subscribe to.
            callback: The callback to call when a change occurs.
                Receives a MessageData object.
            dataset_id: Optional dataset ID to filter changes by.

        Returns:
            A unique subscription ID.
        """
        pass

    @abstractmethod
    def unsubscribe(self, subscription_id: str) -> bool:
        """Unsubscribe a subscription by its ID.

        Args:
            subscription_id: The subscription ID to unsubscribe.

        Returns:
            True if a subscription was removed, False otherwise.
        """
        pass

    @abstractmethod
    def unsubscribe_all(self, channel: str) -> None:
        """Unsubscribe all subscriptions for a given channel.

        Args:
            channel: The channel to unsubscribe all subscriptions from.
        """
        pass

    @abstractmethod
    def empty_subscribers(self) -> None:
        """Remove all subscribers from all channels."""
        pass

    @abstractmethod
    def get_subscribers(
        self, channel: str
    ) -> Dict[str, Tuple[SubscriptionCallback, Optional[str]]]:
        """Retrieve all subscriptions for a given channel.

        Args:
            channel: The channel to get subscriptions for.

        Returns:
            A dictionary mapping subscription ID to a tuple of
            (callback, dataset_id).
        """
        pass


class InLocalMemorySubscriptionRegistry(LocalSubscriptionRegistry):
    """In-memory implementation of the subscription registry.

    Thread-safe registry that stores subscriptions in memory.
    """

    def __init__(self):
        # Maps channel -> {subscription_id -> (callback, dataset_id)}
        self._registry: Dict[
            str, Dict[str, Tuple[SubscriptionCallback, Optional[str]]]
        ] = {}

        # Registry might be accessed/modified by main thread (store.subscribe())
        # or from notification service daemon thread to get list of subscribers
        self._lock = threading.Lock()

    def subscribe(
        self,
        channel: str,
        callback: SubscriptionCallback,
        dataset_id: Optional[str] = None,
    ) -> str:
        sub_id = str(uuid.uuid4())

        with self._lock:
            if channel not in self._registry:
                self._registry[channel] = {}
            self._registry[channel][sub_id] = (callback, dataset_id)

        return sub_id

    def unsubscribe(self, subscription_id: str) -> bool:
        with self._lock:
            for subs in self._registry.values():
                if subscription_id in subs:
                    del subs[subscription_id]
                    return True
        return False

    def unsubscribe_all(self, channel: str) -> None:
        with self._lock:
            if channel in self._registry:
                del self._registry[channel]

    def get_subscribers(
        self, channel: str
    ) -> Dict[str, Tuple[SubscriptionCallback, Optional[str]]]:
        with self._lock:
            return self._registry.get(channel, {}).copy()

    def empty_subscribers(self) -> None:
        with self._lock:
            self._registry = {}


default_subscription_registry = InLocalMemorySubscriptionRegistry()
