"""
Core Module for `fiftyone` Database Serializable Documents

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
    result = collection.insert_one(document.serialize(reflective=True))
    document._set_id(result.inserted_id)
    return result


def insert_many(collection, documents):
    result = collection.insert_many(
        [document.serialize(reflective=True) for document in documents]
    )
    for inserted_id, document in zip(result.inserted_ids, documents):
        document._set_id(inserted_id)


class Document(etas.Serializable):
    """Adds additional functionality to Serializable class to handle `_id`
    field which is created when a document is added to the database.
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
    def ingest_time(self):
        """Document UTC generation/ingest time

        - automatically created when added to the database)
        - None, if it has not been added
        """
        if self.id:
            return ObjectId(self.id).generation_time
        return None

    def attributes(self):
        attributes = super(Document, self).attributes()
        if hasattr(self, "_id"):
            attributes += ["_id"]
        return attributes

    @classmethod
    def from_dict(cls, d, *args, **kwargs):
        obj = cls._from_dict(d, *args, **kwargs)

        id = d.get("_id", None)
        if id:
            obj._set_id(id)

        return obj

    # PRIVATE #################################################################

    def _set_id(self, id):
        """This should only be set when reading from the database"""
        self._id = str(id)
        return self

    @classmethod
    def _from_dict(cls, d, *args, **kwargs):
        """Constructs a Serializable object from a JSON dictionary.

        Subclasses must implement this method if they intend to support being
        read from disk.

        Args:
            d: a JSON dictionary representation of a Serializable object
            *args: optional class-specific positional arguments
            **kwargs: optional class-specific keyword arguments

        Returns:
            an instance of the Serializable class
        """
        raise NotImplementedError("Subclass must implement")
