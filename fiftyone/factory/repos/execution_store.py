"""
Execution store repository interface and implementations.

| Copyright 2017-2025, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""

from abc import ABC, abstractmethod
from datetime import datetime
from typing import Any, Dict, List, Optional

from bson import ObjectId

from fiftyone.operators.store.models import (
    KeyDocument,
    StoreDocument,
    KeyPolicy,
)

#
# TODO: update these doc strings to match fiftyone patterns!
#


class ExecutionStoreRepo(ABC):
    """Abstract base class for execution store repositories.

    Each instance operates in a context:
    - If a `dataset_id` is provided, it operates on stores associated with that dataset.
    - If no `dataset_id` is provided, it operates on stores not associated with any dataset.

    To operate on all stores across all contexts, use the ``XXX_global()``
    methods that this class provides.
    """

    def __init__(self, dataset_id: Optional[ObjectId] = None, is_cache=False):
        """Initialize the execution store repository.

        Args:
            dataset_id (Optional[ObjectId]): the dataset ID to operate on
            is_cache (False): whether the store is a cache store
        """
        self._dataset_id = dataset_id

    @abstractmethod
    def create_store(
        self,
        store_name: str,
        metadata: Optional[Dict[str, Any]] = None,
        policy: str = "persist",
    ) -> StoreDocument:
        """Create a store in the store collection.

        Args:
            store_name (str): the name of the store to create
            metadata (Optional[Dict[str, Any]]): the metadata to store with the store

        Returns:
            StoreDocument: the created store document
        """
        pass

    @abstractmethod
    def clear_cache(self, store_name=None) -> None:
        """Clear all keys with either a ``ttl`` or ``policy="eviction"``.

        Args:
            store_name (str, optional): the name of the store to clear. If None,
                all stores will be queried for deletion.
        """
        pass

    @abstractmethod
    def get_store(self, store_name: str) -> Optional[StoreDocument]:
        """Get a store from the store collection.

        Args:
            store_name (str): the name of the store to get

        Returns:
            Optional[StoreDocument]: the store document, or None if the store does not exist
        """
        pass

    @abstractmethod
    def has_store(self, store_name: str) -> bool:
        """Check if a store exists in the store collection.

        Args:
            store_name (str): the name of the store to check

        Returns:
            bool: True if the store exists, False otherwise
        """

    @abstractmethod
    def list_stores(self) -> List[str]:
        """List all stores in the store collection.

        Returns:
            List[str]: a list of store names
        """
        pass

    @abstractmethod
    def count_stores(self) -> int:
        """Count the number of stores in the store collection.

        Returns:
            int: the number of stores
        """
        pass

    @abstractmethod
    def delete_store(self, store_name: str) -> int:
        """Delete a store.

        Args:
            store_name (str): the name of the store to delete

        Returns:
            int: the number of documents deleted
        """
        pass

    @abstractmethod
    def set_key(
        self,
        store_name: str,
        key: str,
        value: Any,
        ttl: Optional[int] = None,
        policy: str = "persist",
    ) -> KeyDocument:
        """Set a key in a store.
        Args:
            store_name (str): The name of the store to set the key in.
            key (str): The key to set.
            value (Any): The value to associate with the key.
            ttl (Optional[int]): Optional TTL (in seconds) after which the key
                will expire and be automatically removed.
            policy (str): The eviction policy for the key. One of:
                - ``"persist"`` (default): Key is persistent until deleted.
                - ``"evict"``: Key is eligible for eviction or cache clearing.

        Returns:
            KeyDocument: The created or updated key document.
        """
        pass

    @abstractmethod
    def set_cache_key(
        self, store_name: str, key: str, value: Any, ttl: Optional[int] = None
    ) -> KeyDocument:
        """Set a cache key in a store.

        Args:
            store_name (str): the name of the store to set the cache key in
            key (str): the cache key to set
            value (Any): the value to set
            ttl (Optional[int]): the TTL of the cache key

        Returns:
            KeyDocument: the created or updated cache key document
        """
        pass

    @abstractmethod
    def has_key(self, store_name: str, key: str) -> bool:
        """Check if a key exists in a store.

        Args:
            store_name (str): the name of the store to check
            key (str): the key to check

        Returns:
            bool: True if the key exists, False otherwise
        """
        pass

    @abstractmethod
    def get_key(self, store_name: str, key: str) -> Optional[KeyDocument]:
        """Get a key from a store.

        Args:
            store_name (str): the name of the store to get the key from
            key (str): the key to get

        Returns:
            Optional[KeyDocument]: the key document, or None if the key does not exist
        """

    @abstractmethod
    def update_ttl(self, store_name: str, key: str, ttl: int) -> bool:
        """Update the TTL of a key.

        Args:
            store_name (str): the name of the store to update the TTL for
            key (str): the key to update the TTL for
            ttl (int): the new TTL

        Returns:
            bool: True if the TTL was updated, False otherwise
        """
        pass

    @abstractmethod
    def delete_key(self, store_name: str, key: str) -> bool:
        """Delete a key from a store.

        Args:
            store_name (str): the name of the store to delete the key from
            key (str): the key to delete

        Returns:
            bool: True if the key was deleted, False otherwise
        """

    @abstractmethod
    def list_keys(self, store_name: str) -> List[str]:
        """List all keys in a store.

        Args:
            store_name (str): the name of the store to list keys for

        Returns:
            List[str]: a list of keys in the store
        """
        pass

    @abstractmethod
    def count_keys(self, store_name: str) -> int:
        """Count the number of keys in a store.

        Args:
            store_name (str): the name of the store to count keys for

        Returns:
            int: the number of keys in the store
        """
        pass

    @abstractmethod
    def cleanup(self) -> int:
        """Delete all stores in the global store collection.

        Returns:
            int: the number of documents deleted
        """
        pass

    @abstractmethod
    def has_store_global(self, store_name: str) -> bool:
        """Check if a store exists in the global store collection.

        Args:
            store_name (str): the name of the store to check

        Returns:
            bool: True if the store exists, False otherwise
        """
        pass

    @abstractmethod
    def list_stores_global(self) -> List[StoreDocument]:
        """List all stores in the global store collection.

        Returns:
            List[StoreDocument]: a list of store documents
        """
        pass

    @abstractmethod
    def count_stores_global(self) -> int:
        """Count the number of stores in the global store collection.

        Returns:
            int: the number of stores
        """
        pass

    @abstractmethod
    def delete_store_global(self, store_name: str) -> int:
        """Delete a store from the global store collection.

        Args:
            store_name (str): the name of the store to delete

        Returns:
            int: the number of documents deleted
        """
        pass


class MongoExecutionStoreRepo(ExecutionStoreRepo):
    """MongoDB implementation of the execution store repository."""

    COLLECTION_NAME = "execution_store"

    def __init__(
        self, collection, dataset_id: Optional[ObjectId] = None, is_cache=False
    ):
        super().__init__(dataset_id, is_cache)
        self._collection = collection
        self._create_indexes()

    def _create_indexes(self):
        indices = [idx["name"] for idx in self._collection.list_indexes()]
        expires_at_name = "expires_at"
        store_name_name = "store_name"
        key_name = "key"
        full_key_name = "unique_store_index"
        dataset_id_name = "dataset_id"
        policy_name = "policy"

        if expires_at_name not in indices:
            self._collection.create_index(
                expires_at_name, name=expires_at_name, expireAfterSeconds=0
            )
        if full_key_name not in indices:
            self._collection.create_index(
                [(store_name_name, 1), (key_name, 1), (dataset_id_name, 1)],
                name=full_key_name,
                unique=True,
            )
        for name in [
            store_name_name,
            key_name,
            dataset_id_name,
            policy_name,
        ]:
            if name not in indices:
                self._collection.create_index(name, name=name)

    def create_store(
        self,
        store_name: str,
        metadata: Optional[Dict[str, Any]] = None,
        policy: str = "persist",
    ) -> StoreDocument:
        store_doc = StoreDocument.from_dict(
            dict(
                store_name=store_name,
                dataset_id=self._dataset_id,
                value=metadata,
                policy=policy,
            )
        )
        self._collection.insert_one(store_doc.to_mongo_dict())
        return store_doc

    def clear_cache(self, store_name=None) -> int:
        query = {
            "dataset_id": self._dataset_id,
            "$or": [
                {"policy": "evict"},
                {"expires_at": {"$type": "date"}},
            ],
        }
        if store_name is not None:
            query["store_name"] = store_name
        result = self._collection.delete_many(query)
        return result.deleted_count

    def get_store(self, store_name: str) -> Optional[StoreDocument]:
        raw_store_doc = self._collection.find_one(
            {
                "store_name": store_name,
                "key": "__store__",
                "dataset_id": self._dataset_id,
            }
        )
        if not raw_store_doc and self.has_store(store_name):
            return StoreDocument(
                store_name=store_name, dataset_id=self._dataset_id
            )
        return StoreDocument(**raw_store_doc) if raw_store_doc else None

    def has_store(self, store_name: str) -> bool:
        result = self._collection.find_one(
            {
                "store_name": store_name,
                "dataset_id": self._dataset_id,
            }
        )
        return bool(result)

    def list_stores(self) -> List[str]:
        pipeline = [
            {"$match": {"dataset_id": self._dataset_id}},
            {"$group": {"_id": "$store_name"}},
        ]
        return [d["_id"] for d in self._collection.aggregate(pipeline)]

    def count_stores(self) -> int:
        pipeline = [
            {"$match": {"dataset_id": self._dataset_id}},
            {"$group": {"_id": "$store_name"}},
            {"$count": "total_stores"},
        ]
        result = list(self._collection.aggregate(pipeline))
        return result[0]["total_stores"] if result else 0

    def delete_store(self, store_name: str) -> int:
        result = self._collection.delete_many(
            {
                "store_name": store_name,
                "dataset_id": self._dataset_id,
            }
        )
        return result.deleted_count

    def set_key(
        self,
        store_name: str,
        key: str,
        value: Any,
        ttl: Optional[int] = None,
        policy: str = "persist",
    ) -> KeyDocument:
        now = datetime.utcnow()
        expiration = KeyDocument.get_expiration(ttl)
        policy = "evict" if ttl is not None or policy == "evict" else "persist"
        if ttl is not None or policy == "evict":
            policy = "evict"
        else:
            policy = "persist"

        key_doc = KeyDocument.from_dict(
            dict(
                store_name=store_name,
                key=key,
                value=value,
                updated_at=now,
                expires_at=expiration,
                dataset_id=self._dataset_id,
                policy=policy,
            )
        )
        on_insert_fields = {
            "store_name": store_name,
            "key": key,
            "created_at": now,
            "expires_at": expiration if ttl else None,
            "dataset_id": self._dataset_id,
            "policy": policy,
        }
        update_fields = {
            "$set": {
                k: v
                for k, v in key_doc.to_mongo_dict().items()
                if k
                not in {
                    "_id",
                    "created_at",
                    "expires_at",
                    "store_name",
                    "key",
                    "dataset_id",
                    "policy",
                }
            },
            "$setOnInsert": on_insert_fields,
        }
        result = self._collection.update_one(
            {
                "store_name": store_name,
                "key": key,
                "dataset_id": self._dataset_id,
            },
            update_fields,
            upsert=True,
        )
        if result.upserted_id:
            key_doc.created_at = now
        else:
            key_doc.updated_at = now
        return key_doc

    def set_cache_key(self, store_name, key, value, ttl=None):
        return self.set_key(store_name, key, value, ttl, policy="evict")

    def has_key(self, store_name: str, key: str) -> bool:
        result = self._collection.find_one(
            {
                "store_name": store_name,
                "key": key,
                "dataset_id": self._dataset_id,
            }
        )
        return bool(result)

    def get_key(self, store_name: str, key: str) -> Optional[KeyDocument]:
        raw_key_doc = self._collection.find_one(
            {
                "store_name": store_name,
                "key": key,
                "dataset_id": self._dataset_id,
            }
        )
        return KeyDocument.from_dict(raw_key_doc) if raw_key_doc else None

    def update_ttl(self, store_name: str, key: str, ttl: int) -> bool:
        expiration = KeyDocument.get_expiration(ttl)
        result = self._collection.update_one(
            {
                "store_name": store_name,
                "key": key,
                "dataset_id": self._dataset_id,
            },
            {"$set": {"expires_at": expiration}},
        )
        return result.modified_count > 0

    def delete_key(self, store_name: str, key: str) -> bool:
        result = self._collection.delete_one(
            {
                "store_name": store_name,
                "key": key,
                "dataset_id": self._dataset_id,
            }
        )
        return result.deleted_count > 0

    def list_keys(self, store_name: str) -> List[str]:
        result = self._collection.find(
            {
                "store_name": store_name,
                "key": {"$ne": "__store__"},
                "dataset_id": self._dataset_id,
            },
            {"key": 1},
        )
        return [d["key"] for d in result]

    def count_keys(self, store_name: str) -> int:
        return self._collection.count_documents(
            {
                "store_name": store_name,
                "key": {"$ne": "__store__"},
                "dataset_id": self._dataset_id,
            }
        )

    def cleanup(self) -> int:
        result = self._collection.delete_many({"dataset_id": self._dataset_id})
        return result.deleted_count

    def has_store_global(self, store_name: str) -> bool:
        result = self._collection.find_one({"store_name": store_name})
        return bool(result)

    def list_stores_global(self) -> List[StoreDocument]:
        pipeline = [
            {
                "$group": {
                    "_id": {
                        "store_name": "$store_name",
                        "dataset_id": "$dataset_id",
                    }
                }
            },
            {
                "$project": {
                    "_id": 0,
                    "store_name": "$_id.store_name",
                    "dataset_id": "$_id.dataset_id",
                }
            },
        ]
        result = self._collection.aggregate(pipeline)
        return [StoreDocument(**d) for d in result]

    def count_stores_global(self) -> int:
        pipeline = [
            {
                "$group": {
                    "_id": {
                        "store_name": "$store_name",
                        "dataset_id": "$dataset_id",
                    }
                }
            },
            {"$count": "total_stores"},
        ]
        result = list(self._collection.aggregate(pipeline))
        return result[0]["total_stores"] if result else 0

    def delete_store_global(self, store_name: str) -> int:
        result = self._collection.delete_many({"store_name": store_name})
        return result.deleted_count


class InMemoryExecutionStoreRepo(ExecutionStoreRepo):
    """In-memory implementation of execution store repository."""

    def __init__(self, dataset_id: Optional[ObjectId] = None):
        super().__init__(dataset_id)
        self._docs = {}

    def _doc_key(self, store_name: str, key: str) -> tuple:
        return (store_name, key, self._dataset_id)

    def create_store(
        self,
        store_name: str,
        metadata: Optional[Dict[str, Any]] = None,
        policy: str = "persist",
    ) -> StoreDocument:
        store_doc = StoreDocument.from_dict(
            dict(
                store_name=store_name,
                dataset_id=self._dataset_id,
                value=metadata,
                policy=policy,
            )
        )
        key = self._doc_key(store_name, "__store__")
        self._docs[key] = store_doc.to_mongo_dict()
        return store_doc

    def clear_cache(self, store_name=None) -> int:
        deleted = 0
        for key in list(self._docs):
            _, key_name, dataset_id = key
            if (
                dataset_id == self._dataset_id
                and self._docs[key].get("policy") == "evict"
                and (
                    self._docs[key].get("expires_at") is not None
                    or store_name is None
                    or store_name == key[0]
                )
            ):
                del self._docs[key]
                deleted += 1
        return deleted

    def get_store(self, store_name: str) -> Optional[StoreDocument]:
        key = self._doc_key(store_name, "__store__")
        doc = self._docs.get(key)
        if not doc and self.has_store(store_name):
            return StoreDocument.from_dict(
                dict(store_name=store_name, dataset_id=self._dataset_id)
            )
        return StoreDocument.from_dict(doc) if doc else None

    def has_store(self, store_name: str) -> bool:
        return any(
            s == store_name and ds == self._dataset_id
            for (s, _, ds) in self._docs.keys()
        )

    def list_stores(self) -> List[str]:
        stores = {
            s for (s, _, ds) in self._docs.keys() if ds == self._dataset_id
        }
        return list(stores)

    def count_stores(self) -> int:
        return len(self.list_stores())

    def delete_store(self, store_name: str) -> int:
        keys_to_delete = [
            key
            for key in self._docs
            if key[0] == store_name and key[2] == self._dataset_id
        ]
        for key in keys_to_delete:
            del self._docs[key]
        return len(keys_to_delete)

    def set_key(
        self,
        store_name: str,
        key: str,
        value: Any,
        ttl: Optional[int] = None,
        policy: str = "persist",
    ) -> KeyDocument:
        now = datetime.utcnow()
        expiration = KeyDocument.get_expiration(ttl)
        key_doc = KeyDocument.from_dict(
            dict(
                store_name=store_name,
                key=key,
                value=value,
                updated_at=now,
                expires_at=expiration,
                dataset_id=self._dataset_id,
                policy="evict"
                if policy == "evict" or ttl is not None
                else "persist",
            )
        )
        composite_key = self._doc_key(store_name, key)
        if composite_key not in self._docs:
            key_doc.created_at = now
        self._docs[composite_key] = key_doc.to_mongo_dict()
        return key_doc

    def set_cache_key(
        self, store_name: str, key: str, value: Any, ttl: Optional[int] = None
    ) -> None:
        return self.set_key(store_name, key, value, ttl=ttl, policy="evict")

    def has_key(self, store_name: str, key: str) -> bool:
        composite_key = self._doc_key(store_name, key)
        return composite_key in self._docs

    def get_key(self, store_name: str, key: str) -> Optional[KeyDocument]:
        composite_key = self._doc_key(store_name, key)
        doc = self._docs.get(composite_key)
        return KeyDocument.from_dict(doc) if doc else None

    def update_ttl(self, store_name: str, key: str, ttl: int) -> bool:
        composite_key = self._doc_key(store_name, key)
        doc = self._docs.get(composite_key)
        if not doc:
            return False
        expiration = KeyDocument.get_expiration(ttl)
        doc["expires_at"] = expiration
        self._docs[composite_key] = doc
        return True

    def update_policy(self, store_name: str, key: str, policy: str) -> bool:
        composite_key = self._doc_key(store_name, key)
        doc = self._docs.get(composite_key)
        if not doc:
            return False
        # Update the policy in the document
        doc["policy"] = policy
        self._docs[composite_key] = doc
        return True

    def delete_key(self, store_name: str, key: str) -> bool:
        composite_key = self._doc_key(store_name, key)
        if composite_key in self._docs:
            del self._docs[composite_key]
            return True
        return False

    def list_keys(self, store_name: str) -> List[str]:
        return [
            k
            for (s, k, ds) in self._docs.keys()
            if s == store_name and ds == self._dataset_id and k != "__store__"
        ]

    def count_keys(self, store_name: str) -> int:
        return len(self.list_keys(store_name))

    def cleanup(self) -> int:
        keys_to_delete = [
            key for key in self._docs if key[2] == self._dataset_id
        ]
        count = len(keys_to_delete)
        for key in keys_to_delete:
            del self._docs[key]
        return count

    def has_store_global(self, store_name: str) -> bool:
        return any(s == store_name for (s, _, _) in self._docs.keys())

    def list_stores_global(self) -> List[StoreDocument]:
        seen = {}
        for s, _, ds in self._docs.keys():
            if s not in seen:
                seen[s] = StoreDocument(store_name=s, dataset_id=ds)
        return list(seen.values())

    def count_stores_global(self) -> int:
        return len({s for (s, _, _) in self._docs.keys()})

    def delete_store_global(self, store_name: str) -> int:
        keys_to_delete = [key for key in self._docs if key[0] == store_name]
        for key in keys_to_delete:
            del self._docs[key]
        return len(keys_to_delete)
