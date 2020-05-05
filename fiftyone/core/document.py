"""
Core module for serializable database documents.

This is an extension of `eta.core.serial.Serializable` class that provides
additional functionality centered around `Document` objects, which are
serializables that can be inserted and read from the MongoDB database.

Important functionality includes:
- access to the ID which is automatically generated when the Document is
    inserted in the database
- access to the dataset (collection) name which is similarly populated when
    the sample is inserted into a dataset (collection)
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
    """Inserts the given document into the collection.

    Args:
        collection: a ``pymongo.collection``
        document: a :class:`fiftyone.core.document.Document`
    """
    result = collection.insert_one(document.serialize())
    document._set_db_attrs(result.inserted_id, collection)
    return result


def insert_many(collection, documents):
    """Inserts the given documents into the collection.

    Args:
        collection: a ``pymongo.collection``
        document: an iterable of :class:`fiftyone.core.document.Document`
            instances
    """
    result = collection.insert_many([d.serialize() for d in documents])
    for inserted_id, document in zip(result.inserted_ids, documents):
        document._set_db_attrs(inserted_id, collection)


def update_one(collection, document, update):
    """Updates the given document in the collection.

    Args:
        collection: a ``pymongo.collection``
        document: a :class:`fiftyone.core.document.Document`
        update: an update dict

    Returns:
        True/False whether the document was modified
    """
    result = collection.update_one({"_id": ObjectId(document.id)}, update)
    return result.modified_count == 1


def delete_one(collection, document_id):
    """Updates the given document in the collection.

    Args:
        collection: a ``pymongo.collection``
        document_id: the ``_id`` of the :class:`fiftyone.core.document.Document`

    Returns:
        True/False whether the document was deleted
    """
    result = collection.delete_one({"_id": ObjectId(document_id)})
    return result.deleted_count == 1


class Document(etas.Serializable):
    """Base class for objects that are serialized to the database.

    This class adds functionality to ``eta.core.serial.Serializable`` to
    provide `_id` and `_collection` fields which are populated when a document
    is added to the database.
    """

    def __init__(self):
        self._id = None
        self._collection = None

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
    def collection_name(self):
        """The name of the collection that the document has been inserted into,
        or ``None`` if it has not been added to a collection.
        """
        if self._collection:
            return self._collection.name

        return None

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
        _collection = d.get("_collection", None)
        document._set_db_attrs(_id, _collection)

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

    def _set_db_attrs(self, _id, _collection):
        self._id = str(_id)
        self._collection = _collection
