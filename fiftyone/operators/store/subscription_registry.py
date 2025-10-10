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
from typing import Callable, Dict, Optional, Tuple

logger = logging.getLogger(__name__)


class LocalSubscriptionRegistry(ABC):
    """Abstract base class for subscription registry."""

    @abstractmethod
    def subscribe(
        self,
        store_name: str,
        callback: Callable[[str], None],
        dataset_id: Optional[str] = None,
    ) -> str:
        """
        Registers a subscription for a given store.
        Returns a unique subscription id.

        Args:
            store_name: The name of the store to subscribe to.
            callback: The callback to call when a change occurs.
            dataset_id: Optional dataset ID to filter changes by.
        """
        pass

    @abstractmethod
    def unsubscribe(self, subscription_id: str) -> bool:
        """
        Unsubscribes a subscription by its id.
        Returns True if a subscription was removed.
        """
        pass

    @abstractmethod
    def unsubscribe_all(self, store_name: str):
        """
        Unsubscribes all subscriptions for a given store.
        """
        pass

    @abstractmethod
    def empty_subscribers(self) -> None:
        """
        Empties all subscribers.
        """
        pass

    @abstractmethod
    def get_subscribers(
        self, store_name: str
    ) -> Dict[str, Tuple[Callable[[str], None], Optional[str]]]:
        """
        Retrieves all subscriptions for a given store.
        Returns a dictionary mapping subscription id to a tuple of (callback, dataset_id).
        """
        pass


class InLocalMemorySubscriptionRegistry(LocalSubscriptionRegistry):
    def __init__(self):
        # Maps store_name -> {subscription_id -> (callback, dataset_id)}
        self._registry: Dict[
            str, Dict[str, Tuple[Callable[[str], None], Optional[str]]]
        ] = {}

        # registry might either be accessed / modified by main
        # thread (store.subscribe())
        # or from notification service daemon thread to get
        # list of subscribers for a store
        self._lock = threading.Lock()

    def subscribe(
        self,
        store_name: str,
        callback: Callable[[str], None],
        dataset_id: Optional[str] = None,
    ) -> str:
        sub_id = str(uuid.uuid4())

        with self._lock:
            if store_name not in self._registry:
                self._registry[store_name] = {}
            self._registry[store_name][sub_id] = (callback, dataset_id)

        return sub_id

    def unsubscribe(self, subscription_id: str) -> bool:
        with self._lock:
            for store, subs in self._registry.items():
                if subscription_id in subs:
                    del subs[subscription_id]
                    return True
        return False

    def unsubscribe_all(self, store_name: str):
        with self._lock:
            if store_name in self._registry:
                del self._registry[store_name]

    def get_subscribers(
        self, store_name: str
    ) -> Dict[str, Tuple[Callable[[str], None], Optional[str]]]:
        with self._lock:
            return self._registry.get(store_name, {}).copy()

    def empty_subscribers(self) -> None:
        with self._lock:
            self._registry = {}


default_subscription_registry = InLocalMemorySubscriptionRegistry()
