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
from mongoengine import Document, EmbeddedDocument
import numpy as np

try:
    import pprintpp as pprint

    # import pprint

    # Monkey patch to prevent sorting keys
    # https://stackoverflow.com/a/25688431
    pprint._sorted = lambda x: x
except:
    import pprint

import eta.core.serial as etas


class SerializableDocument(object):
    """Mixin for documents that can be serialized in BSON or JSON format."""

    def __str__(self):
        return _pformat(self._to_str_dict())

    def __copy__(self):
        return self.copy()

    def _to_str_dict(self):
        d = {}
        for f in _to_front(self._to_str_fields, "id"):
            value = getattr(self, f)
            if isinstance(value, SerializableDocument):
                d[f] = value._to_str_dict()
            elif isinstance(value, ObjectId):
                d[f] = str(value)
            else:
                d[f] = value

        return d

    @property
    def _to_str_fields(self):
        """An ordered tuple of names of fields on the document that should be
        printed.
        """
        raise NotImplementedError("Subclass must implement `_to_str_fields`")

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
        d = json.loads(s)
        return cls.from_dict(d, extended=True)


class ODMDocument(Document, SerializableDocument):
    """Base class for documents that are stored in a MongoDB collection.

    The ID of a document is automatically populated when it is added to the
    database, and the ID of a document is ``None`` if it has not been added to
    the database.

    Attributes:
        id: the ID of the document, or ``None`` if it has not been added to the
            dataset
    """

    meta = {"abstract": True}

    def __str__(self):
        return _pformat(self._to_str_dict())

    @property
    def _to_str_fields(self):
        # pylint: disable=no-member
        return self._fields_ordered

    @property
    def ingest_time(self):
        """The time the document was added to the database, or ``None`` if it
        has not been added to the database.
        """
        # pylint: disable=no-member
        return self.id.generation_time if self.in_db else None

    @property
    def in_db(self):
        """Whether the underlying :class:`fiftyone.core.odm.ODMDocument` has
        been inserted into the database.
        """
        return getattr(self, "id", None) is not None

    def copy(self):
        """Returns a copy of the document that does not have its `id` set.

        Returns:
            a :class:`ODMDocument`
        """
        doc = deepcopy(self)
        if doc.id is not None:
            doc.id = None

        return doc

    def to_dict(self, extended=False):
        if extended:
            return json.loads(self.to_json())

        return json_util.loads(self.to_json())

    @classmethod
    def from_dict(cls, d, extended=False):
        if not extended:
            try:
                # Attempt to load the document directly, assuming it is in
                # extended form

                # pylint: disable=no-member
                return cls._from_son(d, created=False)
            except Exception:
                pass

        return cls.from_json(json_util.dumps(d), created=False)


class ODMEmbeddedDocument(EmbeddedDocument, SerializableDocument):
    """Base class for documents that are embedded within other documents and
    therefore aren't stored in their own collection in the database.
    """

    meta = {"abstract": True}

    def __init__(self, *args, **kwargs):
        super(ODMEmbeddedDocument, self).__init__(*args, **kwargs)
        self.validate()

    def __str__(self):
        return _pformat(self._to_str_dict())

    @property
    def _to_str_fields(self):
        # pylint: disable=no-member
        return self._fields_ordered

    def to_dict(self, extended=False):
        if extended:
            return json.loads(self.to_json())

        return json_util.loads(self.to_json())

    @classmethod
    def from_dict(cls, d, extended=False):
        if not extended:
            try:
                # Attempt to load the document directly, assuming it is in
                # extended form

                # pylint: disable=no-member
                return cls._from_son(d, created=False)
            except Exception:
                pass

        return cls.from_json(json_util.dumps(d), created=False)


def _to_front(l, val):
    l = list(l)
    try:
        l.remove(val)
        l.insert(0, val)
    except ValueError:
        pass

    return l


def _pformat(doc):
    return pprint.pformat(doc, indent=4)
