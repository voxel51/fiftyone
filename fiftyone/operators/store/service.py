"""
Execution store service.

| Copyright 2017-2025, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""

from bson import ObjectId
from typing import Any, Optional

from fiftyone.operators.store.models import StoreDocument, KeyDocument


class ExecutionStoreService(object):
    """Service for managing execution store operations.

    Note that each instance of this service has a context:

    -   If a ``dataset_id`` is provided (or a ``repo`` associated with one),
        this instance operates on stores associated with that dataset
    -   If no ``dataset_id`` is provided (or a ``repo`` is provided that is not
        associated with one), this instance operates on stores that are not
        associated with a dataset

    To operate on all stores across all contexts, use the ``XXX_global()``
    methods that this class provides.

    Args:
        repo (None): a
            :class:`fiftyone.factory.repos.execution_store.ExecutionStoreRepo`
        dataset_id (None): a dataset ID to scope operations to
    """

    def __init__(
        self,
        repo: Optional["ExecutionStoreRepo"] = None,
        dataset_id: Optional[ObjectId] = None,
        collection_name: str = None,
    ):

        from fiftyone.factory.repo_factory import (
            RepositoryFactory,
            ExecutionStoreRepo,
        )

        if repo is None:
            repo = RepositoryFactory.execution_store_repo(
                dataset_id=dataset_id,
                collection_name=collection_name,
            )
        self._dataset_id = dataset_id
        self._repo: ExecutionStoreRepo = repo

    def create_store(
        self, store_name: str, metadata: Optional[dict[str, Any]] = None
    ) -> StoreDocument:
        """Creates a new store with the specified name.

        Args:
            store_name: the name of the store

        Returns:
            a :class:`fiftyone.store.models.StoreDocument`
        """
        return self._repo.create_store(store_name, metadata=metadata)

    def get_store(self, store_name: str) -> StoreDocument:
        """Gets the specified store for the current context.

        Args:
            store_name: the name of the store

        Returns:
            a :class:`fiftyone.store.models.StoreDocument`
        """
        return self._repo.get_store(store_name)

    def list_stores(self) -> list[str]:
        """Lists all stores for the current context.

        Returns:
            a list of store names
        """
        return self._repo.list_stores()

    def count_stores(self) -> int:
        """Counts the stores for the current context.

        Returns:
            the number of stores
        """
        return self._repo.count_stores()

    def has_store(self, store_name) -> bool:
        """Determines whether the specified store exists in the current
        context.

        Args:
            store_name: the name of the store

        Returns:
            True/False
        """
        return self._repo.has_store(store_name)

    def delete_store(self, store_name: str) -> StoreDocument:
        """Deletes the specified store.

        Args:
            store_name: the name of the store

        Returns:
            a :class:`fiftyone.store.models.StoreDocument`
        """
        return self._repo.delete_store(store_name)

    def set_key(
        self, store_name: str, key: str, value: Any, ttl: Optional[int] = None
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
        return self._repo.set_key(store_name, key, value, ttl=ttl)

    def has_key(self, store_name: str, key: str) -> bool:
        """Determines whether the specified key exists in the specified store.

        Args:
            store_name: the name of the store
            key: the key to check
        """
        return self._repo.has_key(store_name, key)

    def get_key(self, store_name: str, key: str) -> KeyDocument:
        """Retrieves the value of a key from the specified store.

        Args:
            store_name: the name of the store
            key: the key to retrieve

        Returns:
            a :class:`fiftyone.store.models.KeyDocument`
        """
        return self._repo.get_key(store_name, key)

    def delete_key(self, store_name: str, key: str) -> bool:
        """Deletes the specified key from the store.

        Args:
            store_name: the name of the store
            key: the key to delete

        Returns:
            `True` if the key was deleted, `False` otherwise
        """
        return self._repo.delete_key(store_name, key)

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
        return self._repo.update_ttl(store_name, key, new_ttl)

    def list_keys(self, store_name: str) -> list[str]:
        """Lists all keys in the specified store.

        Args:
            store_name: the name of the store

        Returns:
            a list of keys in the store
        """
        return self._repo.list_keys(store_name)

    def count_keys(self, store_name: str) -> int:
        """Counts the keys in the specified store.

        Args:
            store_name: the name of the store

        Returns:
            the number of keys in the store
        """
        return self._repo.count_keys(store_name)

    def cleanup(self) -> None:
        """Deletes all stores associated with the current context."""
        self._repo.cleanup()

    def has_store_global(self, store_name) -> bool:
        """Determines whether a store with the given name exists across all
        datasets and the global context.

        Args:
            store_name: the name of the store

        Returns:
            True/False
        """
        return self._repo.has_store_global(store_name)

    def list_stores_global(self) -> list[StoreDocument]:
        """Lists the stores across all datasets and the global context.

        Returns:
            a list of :class:`fiftyone.store.models.StoreDocument`
        """
        return self._repo.list_stores_global()

    def count_stores_global(self) -> int:
        """Counts the stores across all datasets and the global context.

        Returns:
            the number of stores
        """
        return self._repo.count_stores_global()

    def delete_store_global(self, store_name) -> int:
        """Deletes the specified store across all datasets and the global
        context.

        Args:
            store_name: the name of the store

        Returns:
            the number of stores deleted
        """
        return self._repo.delete_store_global(store_name)
