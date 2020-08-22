"""
Base classes for documents that back dataset contents.

| Copyright 2017-2020, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""
from copy import deepcopy
import json
import re

from bson import json_util
from bson.objectid import ObjectId
import mongoengine
import pymongo

import fiftyone.core.utils as fou

import eta.core.serial as etas


class SerializableDocument(object):
    """Mixin for documents that can be serialized in BSON or JSON format."""

    def __str__(self):
        return self.__repr__()

    def __repr__(self):
        d = {}
        for f in self._get_repr_fields():
            if f.startswith("_"):
                continue

            value = getattr(self, f)

            if isinstance(value, ObjectId):
                d[f] = str(value)
            else:
                d[f] = value

        doc_str = fou.pformat(d)
        return "<%s: %s>" % (self.__class__.__name__, doc_str)

    def __eq__(self, other):
        if not isinstance(other, self.__class__):
            return False

        return self.to_dict() == other.to_dict()

    def _get_repr_fields(self):
        """Returns an ordered tuple of field names that should be included in
        the ``repr`` of the document.

        Returns:
            a tuple of field names
        """
        raise NotImplementedError("Subclass must implement `_get_repr_fields`")

    def copy(self):
        """Returns a deep copy of the document.

        Returns:
            a :class:`SerializableDocument`
        """
        return deepcopy(self)

    def to_dict(self, extended=False):
        """Serializes this document to a BSON/JSON dictionary.

        Args:
            extended (False): whether to serialize extended JSON constructs
                such as ObjectIDs, Binary, etc. into JSON format

        Returns:
            a dict
        """
        raise NotImplementedError("Subclass must implement `to_dict()`")

    @classmethod
    def from_dict(cls, d, extended=False):
        """Loads the document from a BSON/JSON dictionary.

        Args:
            d: a dictionary
            extended (False): whether the input dictionary may contain
                serialized extended JSON constructs

        Returns:
            a :class:`SerializableDocument`
        """
        raise NotImplementedError("Subclass must implement `from_dict()`")

    def to_json(self, pretty_print=False):
        """Serializes the document to a JSON string.

        Args:
            pretty_print (False): whether to render the JSON in human readable
                format with newlines and indentations

        Returns:
            a JSON string
        """
        d = self.to_dict(extended=True)
        return etas.json_to_str(d, pretty_print=pretty_print)

    @classmethod
    def from_json(cls, s):
        """Loads the document from a JSON string.

        Returns:
            a :class:`SerializableDocument`
        """
        d = json_util.loads(s)
        return cls.from_dict(d, extended=False)


class MongoEngineBaseDocument(SerializableDocument):
    """Mixin for all ``mongoengine.base.BaseDocument`` subclasses that
    implements the :class:`SerializableDocument` interface.
    """

    def __deepcopy__(self, memo):
        # pylint: disable=no-member, unsubscriptable-object
        kwargs = {
            f: deepcopy(self[f], memo)
            for f in self._fields_ordered
            if f not in ("_cls", "_id", "id")
        }
        return self.__class__(**kwargs)

    def _get_repr_fields(self):
        # pylint: disable=no-member
        return self._fields_ordered

    def to_dict(self, extended=False):
        if extended:
            return json.loads(self._to_json())

        return json_util.loads(self._to_json())

    @classmethod
    def from_dict(cls, d, extended=False):
        if not extended:
            try:
                # Attempt to load the document directly, assuming it is in
                # extended form

                # pylint: disable=no-member
                return cls._from_son(d)
            except Exception:
                pass

        # pylint: disable=no-member
        bson_data = json_util.loads(json_util.dumps(d))
        return cls._from_son(bson_data)

    def _to_json(self):
        # @todo mongoengine snippet, to be replaced
        # pylint: disable=no-member
        return json_util.dumps(self.to_mongo(use_db_field=True))


class BaseDocument(MongoEngineBaseDocument):
    """Base class for documents that are written to the database in their own
    collections.

    The ID of a document is automatically populated when it is added to the
    database, and the ID of a document is ``None`` if it has not been added to
    the database.

    Attributes:
        id: the ID of the document, or ``None`` if it has not been added to the
            database
    """

    def __eq__(self, other):
        # pylint: disable=no-member
        if self.id != other.id:
            return False

        return super().__eq__(other)

    def _get_repr_fields(self):
        # pylint: disable=no-member
        return ("id",) + tuple(f for f in self._fields_ordered if f != "id")

    @property
    def ingest_time(self):
        """The time the document was added to the database, or ``None`` if it
        has not been added to the database.
        """
        # pylint: disable=no-member
        return self.id.generation_time if self.in_db else None

    @property
    def in_db(self):
        """Whether the underlying :class:`fiftyone.core.odm.Document` has
        been inserted into the database.
        """
        # pylint: disable=no-member
        return self.id is not None


class BaseEmbeddedDocument(MongoEngineBaseDocument):
    """Base class for documents that are embedded within other documents and
    therefore are not stored in their own collection in the database.
    """

    pass


class Document(BaseDocument, mongoengine.Document):
    """Base class for documents that are stored in a MongoDB collection.

    The ID of a document is automatically populated when it is added to the
    database, and the ID of a document is ``None`` if it has not been added to
    the database.

    Attributes:
        id: the ID of the document, or ``None`` if it has not been added to the
            database
    """

    meta = {"abstract": True}


class DynamicDocument(BaseDocument, mongoengine.DynamicDocument):
    """Base class for dynamic documents that are stored in a MongoDB
    collection.

    Dynamic documents can have arbitrary fields added to them.

    The ID of a document is automatically populated when it is added to the
    database, and the ID of a document is ``None`` if it has not been added to
    the database.

    Attributes:
        id: the ID of the document, or ``None`` if it has not been added to the
            database
    """

    meta = {"abstract": True}


class EmbeddedDocument(BaseEmbeddedDocument, mongoengine.EmbeddedDocument):
    """Base class for documents that are embedded within other documents and
    therefore are not stored in their own collection in the database.
    """

    meta = {"abstract": True}

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self.validate()


class DynamicEmbeddedDocument(
    BaseEmbeddedDocument, mongoengine.DynamicEmbeddedDocument,
):
    """Base class for dynamic documents that are embedded within other
    documents and therefore aren't stored in their own collection in the
    database.

    Dynamic documents can have arbitrary fields added to them.
    """

    meta = {"abstract": True}

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self.validate()
