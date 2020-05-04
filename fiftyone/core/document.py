"""
Core Module for `fiftyone` Database Serializable Documents

This is an extension of `eta.core.serial.Serializable` class that provides
additional functionality centered around `Document` objects, which are
serializables that can be inserted and read from the MongoDB database.

Important functionality includes:
- access to the ID which is automatically generated when the Document is
    inserted in the database
- access to the dataset (collection) name which is similarly populated when
    the sample is inserted into a dataset (collection)
- default reflective serialization when storing to the database

"""
# pragma pylint: disable=redefined-builtin
# pragma pylint: disable=unused-wildcard-import
# pragma pylint: disable=wildcard-import
from __future__ import absolute_import
from __future__ import division
from __future__ import print_function
from __future__ import unicode_literals
from builtins import *

# pragma pylint: enable=redefined-builtin
# pragma pylint: enable=unused-wildcard-import
# pragma pylint: enable=wildcard-import
from bson.objectid import ObjectId

import eta.core.serial as etas


def insert_one(collection, document):
    result = collection.insert_one(document._to_db_dict())
    document._set_db_attrs(result.inserted_id, collection)
    return result


def insert_many(collection, documents):
    result = collection.insert_many(
        [document._to_db_dict() for document in documents]
    )
    for inserted_id, document in zip(result.inserted_ids, documents):
        document._set_db_attrs(inserted_id, collection)


def delete_one(collection, document_id):
    """Returns True if the document was deleted, False, otherwise"""
    result = collection.delete_one({"_id": ObjectId(document_id)})
    return result.deleted_count == 1

class Document(etas.Serializable):
    """Adds additional functionality to Serializable class to handle `_id` and
    `_collection_name` fields which are created when a document is added to the
    database.
    """

    @property
    def id(self):
        """Document ObjectId value.

        - automatically created when added to the database)
        - None, if it has not been added

        The 12-byte ObjectId value consists of:
            - a 4-byte timestamp value, representing the ObjectId’s creation,
              measured in seconds since the Unix epoch
            - a 5-byte random value
            - a 3-byte incrementing counter, initialized to a random value
        """
        if not hasattr(self, "_id"):
            self._id = None
        return self._id

    @property
    def collection_name(self):
        """The name of the collection that the document has been inserted into.
        Returns None if it has not been inserted in the database.
        """
        if not hasattr(self, "_collection_name"):
            self._collection_name = None
        return self._collection_name

    @property
    def ingest_time(self):
        """Document UTC generation/ingest time

        - automatically created when added to the database)
        - None, if it has not been added
        """
        if self.id:
            return ObjectId(self.id).generation_time
        return None

    # PRIVATE #################################################################

    def _set_db_attrs(self, id, collection):
        """This should only be set when reading from the database or updating
        an in memory Document that has been inserted/deleted/updated in the
        database.
        """
        self._id = str(id)
        self._collection_name = collection.name
        return self

    def _to_db_dict(self):
        """Serialize for insertion into a MongoDB database"""
        return self.serialize(reflective=True)

    @classmethod
    def _from_db_dict(cls, collection, d):
        """De-serialize from a MongoDB database"""
        if d is None:
            return d
        document_id = d.pop("_id")
        document = cls.from_dict(d)
        document._set_db_attrs(document_id, collection)
        return document
