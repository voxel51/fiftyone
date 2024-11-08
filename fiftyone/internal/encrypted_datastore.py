"""
FiftyOne Teams internal encrypted datastore management.

| Copyright 2017-2024, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""

import bson
from cryptography.fernet import Fernet


import fiftyone.core.odm as foo
import fiftyone.internal.util as foiu


class EncryptedDatastore(object):
    """Class for managing encrypted datastore"""

    def __init__(self, mongodb_collection, encryption_key):
        self._mongodb_collection = mongodb_collection
        self._fernet = Fernet(encryption_key)

    def delete(self, key):
        """Delete key from datastore"""
        self._mongodb_collection.delete_one({"_id": bson.ObjectId(key)})

    def get(self, key):
        """Get plaintext value from datastore"""
        doc = self._mongodb_collection.find_one(bson.ObjectId(key))
        if not doc:
            raise KeyError(key)
        encrypted = doc.get("data")
        plaintext = self._fernet.decrypt(encrypted).decode()
        return plaintext

    def put(self, value, key_id=None):
        """Store value encrypted"""
        encrypted = self._fernet.encrypt(value.encode())
        doc = {"data": encrypted}
        if key_id:
            doc["_id"] = bson.ObjectId(key_id)
        result = self._mongodb_collection.insert_one(doc)
        return result.inserted_id


def get_scoped_key_store():
    return EncryptedDatastore(
        foo.get_db_conn()["apikeys.scoped"], foiu.get_encryption_key()
    )
