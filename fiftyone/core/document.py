"""
Core module for serializable database documents.

This is an extension of `eta.core.serial.Serializable` class that provides
additional functionality centered around `Document` objects, which are
serializables that can be inserted and read from the MongoDB database.

Important functionality includes:
- access to the ID when is automatically generated when the Document is
    inserted in the database
- default reflective serialization when storing to the database

| Copyright 2017-2020, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
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
    # @todo(Tyler) include collection.name when serializing
    result = collection.insert_one(document.serialize())
    document._set_id(result.inserted_id)
    return result


def insert_many(collection, documents):
    result = collection.insert_many([d.serialize() for d in documents])
    for inserted_id, document in zip(result.inserted_ids, documents):
        document._set_id(inserted_id)


class Document(etas.Serializable):
    """Base class for objects that are serialized to the database.

    This class adds functionality to ``eta.core.serial.Serializable`` to
    provide an  `_id` field which is populated when a document is added to the
    database.
    """

    def __init__(self):
        self._id = None

    @property
    def id(self):
        """The ID of the document.

        Implementation details:

            - the ID of a document is automatically populated when it is added
              to the database

            - the ID is of a document is ``None`` if it has not been added to
              the database

            - the ID is a 12 byte value consisting of the concatentation of the
              following:

                - a 4 byte timestamp representing the document's commit time,
                  measured in seconds since epoch

                - a 5 byte random value

                - a 3 byte incrementing counter, initialized to a random value
        """
        return self._id

    @property
    def ingest_time(self):
        """The time the document was added to the database, or ``None`` if it
        has not been added to the database.
        """
        if self.id:
            return ObjectId(self.id).generation_time

        return None

    @classmethod
    def from_dict(cls, d):
        """Constructs a `class`:Document` from a JSON dictionary.

        *IMPORTANT*: all subclasses must call this superclass method to ensure
        that the document's ``_id`` field is appropriately set.

        Args:
            d: a JSON dictionary

        Returns:
            a `class`:Document`
        """
        document = cls._from_dict(d)

        _id = d.get("_id", None)
        if _id:
            document._set_id(_id)

        return document

    @classmethod
    def _from_dict(cls, d, **kwargs):
        """Internal implementation of :func:`Document.from_dict`.

        Subclasses should implement this method, not
        :func:`Document.from_dict`.

        Args:
            d: a JSON dictionary representation of a :class:`Document`
            **kwargs: keyword arguments for :class:`Document` that have already
                been parsed

        Returns:
            a :class:`Document`
        """
        raise NotImplementedError("Subclass must implement _from_dict()")

    def _set_id(self, _id):
        self._id = str(_id)
