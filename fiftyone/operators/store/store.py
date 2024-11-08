"""
FiftyOne execution store.

| Copyright 2017-2024, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""

import logging
from fiftyone.operators.store.service import ExecutionStoreService
from typing import Any, Optional

logger = logging.getLogger(__name__)


class ExecutionStore:
    @staticmethod
    def create(store_name: str) -> "ExecutionStore":
        return ExecutionStore(store_name, ExecutionStoreService())

    def __init__(self, store_name: str, store_service: ExecutionStoreService):
        """
        Args:
            store_name (str): The name of the store.
            store_service (ExecutionStoreService): The store service instance.
        """
        self.store_name: str = store_name
        self._store_service: ExecutionStoreService = store_service

    def list_all_stores(self) -> list[str]:
        """Lists all stores in the execution store.

        Returns:
            list: A list of store names.
        """
        return self._store_service.list_stores()

    def get(self, key: str) -> Optional[Any]:
        """Retrieves a value from the store by its key.

        Args:
            key (str): The key to retrieve the value for.

        Returns:
            Optional[Any]: The value stored under the given key, or None if not found.
        """
        key_doc = self._store_service.get_key(self.store_name, key)
        if key_doc is None:
            return None
        return key_doc.value

    def set(self, key: str, value: Any, ttl: Optional[int] = None) -> None:
        """Sets a value in the store with an optional TTL.

        Args:
            key (str): The key to store the value under.
            value (Any): The value to store.
            ttl (Optional[int], optional): The time-to-live in seconds. Defaults to None.
        """
        self._store_service.set_key(self.store_name, key, value, ttl)

    def delete(self, key: str) -> bool:
        """Deletes a key from the store.

        Args:
            key (str): The key to delete.

        Returns:
            bool: True if the key was deleted, False otherwise.
        """
        return self._store_service.delete_key(self.store_name, key)

    def has(self, key: str) -> bool:
        """Checks if the store has a specific key.

        Args:
            key (str): The key to check.

        Returns:
            bool: True if the key exists, False otherwise.
        """
        return self._store_service.has_key(self.store_name, key)

    def clear(self) -> None:
        """Clears all the data in the store."""
        self._store_service.delete_store(self.store_name)

    def update_ttl(self, key: str, new_ttl: int) -> None:
        """Updates the TTL for a specific key.

        Args:
            key (str): The key to update the TTL for.
            new_ttl (int): The new TTL in seconds.
        """
        self._store_service.update_ttl(self.store_name, key, new_ttl)

    def get_ttl(self, key: str) -> Optional[int]:
        """Retrieves the TTL for a specific key.

        Args:
            key (str): The key to get the TTL for.

        Returns:
            Optional[int]: The TTL in seconds, or None if the key does not have a TTL.
        """
        return self._store_service.get_ttl(self.store_name, key)

    def list_keys(self) -> list[str]:
        """Lists all keys in the store.

        Returns:
            list: A list of keys in the store.
        """
        return self._store_service.list_keys(self.store_name)
