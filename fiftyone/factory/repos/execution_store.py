"""
Execution store repository.
"""

import datetime
from pymongo.collection import Collection
from fiftyone.operators.store.models import StoreDocument, KeyDocument


def _where(store_name, key=None):
    query = {"store_name": store_name}
    if key is not None:
        query["key"] = key
    return query


class ExecutionStoreRepo:
    """Base class for execution store repositories."""

    COLLECTION_NAME = "execution_store"

    def __init__(self, collection: Collection):
        self._collection = collection

    def create_store(self, store_name, permissions=None) -> StoreDocument:
        """Creates a store in the execution store."""
        store_doc = StoreDocument(store_name=store_name, value=permissions)
        self._collection.insert_one(store_doc.to_mongo_dict())
        return store_doc

    def list_stores(self) -> list[str]:
        """Lists all stores in the execution store."""
        # ensure that only store_name is returned, and only unique values
        return self._collection.distinct("store_name")

    def set_key(self, store_name, key, value, ttl=None) -> KeyDocument:
        """Sets or updates a key in the specified store"""
        now = datetime.datetime.now()
        expiration = KeyDocument.get_expiration(ttl)
        key_doc = KeyDocument(
            store_name=store_name,
            key=key,
            value=value,
            updated_at=now,
            expires_at=expiration,
        )

        # Prepare the update operations
        update_fields = {
            "$set": {
                k: v
                for k, v in key_doc.to_mongo_dict().items()
                if k
                not in {"_id", "created_at", "expires_at", "store_name", "key"}
            },
            "$setOnInsert": {
                "store_name": store_name,
                "key": key,
                "created_at": now,
                "expires_at": expiration if ttl else None,
            },
        }

        # Perform the upsert operation
        result = self._collection.update_one(
            _where(store_name, key), update_fields, upsert=True
        )

        if result.upserted_id:
            key_doc.created_at = now
        else:
            key_doc.updated_at = now

        return key_doc

    def get_key(self, store_name, key) -> KeyDocument:
        """Gets a key from the specified store."""
        raw_key_doc = self._collection.find_one(_where(store_name, key))
        key_doc = KeyDocument(**raw_key_doc) if raw_key_doc else None
        return key_doc

    def list_keys(self, store_name) -> list[str]:
        """Lists all keys in the specified store."""
        keys = self._collection.find(_where(store_name), {"key": 1})
        return [key["key"] for key in keys]

    def update_ttl(self, store_name, key, ttl) -> bool:
        """Updates the TTL for a key."""
        expiration = KeyDocument.get_expiration(ttl)
        result = self._collection.update_one(
            _where(store_name, key), {"$set": {"expires_at": expiration}}
        )
        return result.modified_count > 0

    def delete_key(self, store_name, key) -> bool:
        """Deletes the document that matches the store name and key."""
        result = self._collection.delete_one(_where(store_name, key))
        return result.deleted_count > 0

    def delete_store(self, store_name) -> int:
        """Deletes the entire store."""
        result = self._collection.delete_many(_where(store_name))
        return result.deleted_count


class MongoExecutionStoreRepo(ExecutionStoreRepo):
    """MongoDB implementation of execution store repository."""

    def __init__(self, collection: Collection):
        super().__init__(collection)
        self._create_indexes()

    def _create_indexes(self):
        indices = self._collection.list_indexes()
        expires_at_name = "expires_at"
        store_name_name = "store_name"
        key_name = "key"
        full_key_name = "store_name_and_key"
        if expires_at_name not in indices:
            self._collection.create_index(
                expires_at_name, name=expires_at_name, expireAfterSeconds=0
            )
        if full_key_name not in indices:
            self._collection.create_index(
                [(store_name_name, 1), (key_name, 1)],
                name=full_key_name,
                unique=True,
            )
        for name in [store_name_name, key_name]:
            if name not in indices:
                self._collection.create_index(name, name=name)
