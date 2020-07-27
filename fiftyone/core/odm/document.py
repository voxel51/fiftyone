"""
Base classes for documents that back dataset contents.

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

from copy import deepcopy
import json

from bson import json_util
from bson.objectid import ObjectId
import mongoengine

import fiftyone.core.utils as fou

import eta.core.serial as etas


class SerializableDocument(object):
    """Mixin for documents that can be serialized in BSON or JSON format."""

    def __str__(self):
        return self.__repr__()

    def __repr__(self):
        return self.fancy_repr()

    def __eq__(self, other):
        if not isinstance(other, self.__class__):
            return False

        return self.to_dict() == other.to_dict()

    def __copy__(self):
        return self.copy()

    def fancy_repr(self, class_name=None, exclude_fields=None):
        """Repr, but fancier.

        Args:
            class_name: optional string name to replace the class name
            exclude_fields: optional iterable of field names to exclude
        """
        s = fou.pformat(self._to_repr_dict(exclude_fields=exclude_fields))
        class_name = class_name or self._get_class_repr()
        return "<%s: %s>" % (class_name, s)

    def _to_repr_dict(self, exclude_fields=None):
        d = {}
        for f in self._to_str_fields:
            if f.startswith("_") or exclude_fields and f in exclude_fields:
                continue

            value = getattr(self, f)

            if isinstance(value, ObjectId):
                d[f] = str(value)
            else:
                d[f] = value

        return d

    @property
    def _to_str_fields(self):
        """An ordered tuple of field names that should be included in the
        string representation of the document.
        """
        raise NotImplementedError("Subclass must implement `_to_str_fields`")

    @classmethod
    def _get_class_repr(cls):
        return cls.__name__

    def copy(self):
        """Returns a deep copy of the document.

        Returns:
            a document
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
            the document
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
            the document
        """
        d = json_util.loads(s)
        return cls.from_dict(d, extended=False)


class MongoEngineBaseDocument(SerializableDocument):
    """Mixin for all ``mongoengine.base.BaseDocument`` subclasses that
    implements the :class:`SerializableDocument` interface.
    """

    @property
    def _to_str_fields(self):
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
        # @todo(Tyler) mongoengine snippet, to be replaced
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

    @property
    def _to_str_fields(self):
        # pylint: disable=no-member
        return _to_front(self._fields_ordered, "id")

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
        return getattr(self, "id", None) is not None

    def copy(self):
        """Returns a copy of the document that does not have its `id` set.

        Returns:
            a :class:`Document`
        """
        doc = deepcopy(self)
        if doc.id is not None:
            # pylint: disable=attribute-defined-outside-init
            doc.id = None

        return doc


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


def _to_front(l, val):
    l = list(l)
    try:
        l.remove(val)
        l.insert(0, val)
    except ValueError:
        pass

    return l
