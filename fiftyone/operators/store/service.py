"""
FiftyOne execution store service.

| Copyright 2017-2024, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""

import logging
from typing import Optional, List
from fiftyone.operators.store.models import StoreDocument, KeyDocument

logger = logging.getLogger(__name__)


class ExecutionStoreService:
    """Service for managing execution store operations."""

    def __init__(self, repo: Optional["ExecutionStoreRepo"] = None):
        from fiftyone.factory.repo_factory import (
            RepositoryFactory,
            ExecutionStoreRepo,
        )

        if repo is None:
            repo = RepositoryFactory.execution_store_repo()

        self._repo: ExecutionStoreRepo = repo

    def create_store(self, store_name: str) -> StoreDocument:
        """Creates a new store with the specified name.

        Args:
            store_name: the name of the store

        Returns:
            a :class:`fiftyone.store.models.StoreDocument`
        """
        return self._repo.create_store(store_name=store_name)

    def set_key(
        self, store_name: str, key: str, value: str, ttl: Optional[int] = None
    ) -> KeyDocument:
        """Sets the value of a key in the specified store.

        Args:
            store_name: the name of the store
            key: the key to set
            value: the value to set
            ttl (None): an optional TTL in seconds

        Returns:
            a :class:`fiftyone.store.models.KeyDocument`
        """
        return self._repo.set_key(
            store_name=store_name, key=key, value=value, ttl=ttl
        )

    def get_key(self, store_name: str, key: str) -> KeyDocument:
        """Retrieves the value of a key from the specified store.

        Args:
            store_name: the name of the store
            key: the key to retrieve

        Returns:
            a :class:`fiftyone.store.models.KeyDocument`
        """
        return self._repo.get_key(store_name=store_name, key=key)

    def delete_key(self, store_name: str, key: str) -> bool:
        """Deletes the specified key from the store.

        Args:
            store_name: the name of the store
            key: the key to delete

        Returns:
            `True` if the key was deleted, `False` otherwise
        """
        return self._repo.delete_key(store_name=store_name, key=key)

    def update_ttl(
        self, store_name: str, key: str, new_ttl: int
    ) -> KeyDocument:
        """Updates the TTL of the specified key in the store.

        Args:
            store_name: the name of the store
            key: the key to update the TTL for
            new_ttl: the new TTL in seconds

        Returns:
            a :class:`fiftyone.store.models.KeyDocument`
        """
        return self._repo.update_ttl(
            store_name=store_name, key=key, ttl=new_ttl
        )

    def list_stores(self) -> List[StoreDocument]:
        """Lists all stores matching the given criteria.

        Returns:
            a list of :class:`fiftyone.store.models.StoreDocument`
        """
        return self._repo.list_stores()

    def delete_store(self, store_name: str) -> StoreDocument:
        """Deletes the specified store.

        Args:
            store_name: the name of the store

        Returns:
            a :class:`fiftyone.store.models.StoreDocument`
        """
        return self._repo.delete_store(store_name=store_name)

    def list_keys(self, store_name: str) -> List[str]:
        """Lists all keys in the specified store.

        Args:
            store_name: the name of the store

        Returns:
            a list of keys in the store
        """
        return self._repo.list_keys(store_name)
