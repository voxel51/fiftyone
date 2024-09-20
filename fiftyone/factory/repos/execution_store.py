"""
Execution store repository for handling storage and retrieval of stores.
"""

from pymongo.collection import Collection
from fiftyone.operators.store.models import StoreDocument, KeyDocument


class ExecutionStoreRepo:
    """Base class for execution store repositories."""

    COLLECTION_NAME = "execution_store"

    def __init__(self, collection: Collection):
        self._collection = collection

    def create_store(self, store_name, permissions=None):
        """Creates a store in the execution store."""
        store_doc = StoreDocument(
            store_name=store_name, permissions=permissions
        )
        self._collection.insert_one(store_doc.dict())
        return store_doc

    def set_key(self, store_name, key, value, ttl=None):
        """Sets a key in the specified store."""
        key_doc = KeyDocument(key=key, value=value, ttl=ttl)
        self._collection.update_one(
            {"store_name": store_name},
            {"$set": {f"keys.{key}": key_doc.dict()}},
        )
        return key_doc

    def get_key(self, store_name, key):
        """Gets a key from the specified store."""
        store = self._collection.find_one({"store_name": store_name})
        if store and key in store.get("keys", {}):
            return KeyDocument(**store["keys"][key])
        return None

    def update_ttl(self, store_name, key, ttl):
        """Updates the TTL for a key."""
        self._collection.update_one(
            {"store_name": store_name}, {"$set": {f"keys.{key}.ttl": ttl}}
        )

    def delete_key(self, store_name, key):
        """Deletes a key from the store."""
        self._collection.update_one(
            {"store_name": store_name}, {"$unset": {f"keys.{key}": ""}}
        )

    def delete_store(self, store_name):
        """Deletes the entire store."""
        self._collection.delete_one({"store_name": store_name})


class MongoExecutionStoreRepo(ExecutionStoreRepo):
    """MongoDB implementation of execution store repository."""

    COLLECTION_NAME = "execution_store"

    def __init__(self, collection: Collection):
        super().__init__(collection)
