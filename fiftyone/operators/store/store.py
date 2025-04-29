"""
Execution store class.

| Copyright 2017-2025, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""

from datetime import datetime
from typing import Any, Optional

from bson import ObjectId

from fiftyone.operators.store.service import ExecutionStoreService


class ExecutionStore(object):
    """Execution store.

    Args:
        store_name: the name of the store
        store_service: an
            :class:`fiftyone.operators.store.service.ExecutionStoreService`
        default_policy ("persist"): the default eviction policy for the store.
    """

    def __init__(
        self,
        store_name: str,
        store_service: ExecutionStoreService,
        default_policy: str = "persist",
    ):
        self.store_name: str = store_name
        self._store_service: ExecutionStoreService = store_service
        self._default_policy: str = default_policy

    @staticmethod
    def create(
        store_name: str,
        dataset_id: Optional[ObjectId] = None,
        default_policy: str = "persist",
        collection_name: Optional[str] = None,
    ) -> "ExecutionStore":
        return ExecutionStore(
            store_name,
            ExecutionStoreService(
                dataset_id=dataset_id, collection_name=collection_name
            ),
            default_policy,
        )

    def list_stores(self) -> list[str]:
        """Lists all stores in the execution store.

        Returns:
            list: a list of store names
        """
        return self._store_service.list_stores()

    def get(self, key: str) -> Optional[Any]:
        """Retrieves a value from the store by its key.

        Args:
            key: the key to retrieve the value for

        Returns:
            the value stored under the given key, or None if not found
        """
        key_doc = self._store_service.get_key(self.store_name, key)
        if key_doc is None:
            return None
        return key_doc.value

    def set(
        self, key: str, value: Any, ttl: Optional[int] = None, policy=None
    ) -> None:
        """Sets the value of a key in the specified store.

        Args:
            key: the key to set
            value: the value to set
            ttl (None): an optional TTL in seconds
            policy (persist): the eviction policy for the key. Can be "persist" or "evict".
                If "persist", the key will never be automatically removed.
                If "evict", the key may be removed automatically if a TTL is set,
                or manually via :meth:`clear_cache`.

        Returns:
            a :class:`fiftyone.store.models.KeyDocument`
        """
        if policy is None:
            policy = self._default_policy

        self._store_service.set_key(
            self.store_name, key, value, ttl=ttl, policy=policy
        )

    def set_cache(
        self, key: str, value: Any, ttl: Optional[int] = None
    ) -> None:
        """Sets a value in the store with the eviction policy set to "evict".

        Args:
            key: the key to store the value under
            value: the value to store
            ttl (None): the time-to-live in seconds
        """
        self.set(key, value, ttl=ttl, policy="evict")

    def delete(self, key: str) -> bool:
        """Deletes a key from the store.

        Args:
            key: the key to delete.

        Returns:
            True/False whether the key was deleted
        """
        return self._store_service.delete_key(self.store_name, key)

    def has(self, key: str) -> bool:
        """Checks if the store has a specific key.

        Args:
            key: the key to check

        Returns:
            True/False whether the key exists
        """
        return self._store_service.has_key(self.store_name, key)

    def clear(self) -> None:
        """Clears all the data in the store."""
        self._store_service.delete_store(self.store_name)

    def clear_cache(self) -> None:
        """Clears the cache for the store.

        This will remove all keys that are eligible for eviction.
        """
        self._store_service.clear_cache(store_name=self.store_name)

    def update_ttl(self, key: str, new_ttl: int) -> None:
        """Updates the TTL for a specific key.

        Args:
            key: the key to update the TTL for
            new_ttl: the new TTL in seconds
        """
        self._store_service.update_ttl(self.store_name, key, new_ttl)

    def update_policy(self, key: str, policy: str) -> None:
        """Updates the eviction policy for a specific key.

        Args:
            key: the key to update the policy for
            policy: the new policy, either "persist" or "evict"
        """
        self._store_service.update_policy(self.store_name, key, policy)

    def get_metadata(self, key: str) -> Optional[dict]:
        """Retrieves the metadata for the given key.

        Args:
            key: the key to check

        Returns:
            a dict of metadata about the key
        """
        key_doc = self._store_service.get_key(self.store_name, key)
        if key_doc is None:
            return None

        return dict(
            created_at=key_doc.created_at,
            updated_at=key_doc.updated_at,
            expires_at=key_doc.expires_at,
        )

    def list_keys(self) -> list[str]:
        """Lists all keys in the store.

        Returns:
            a list of keys in the store
        """
        return self._store_service.list_keys(self.store_name)
