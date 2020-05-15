"""
Base classes for ODM Documents backing dataset contents.

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
from future.utils import iteritems, itervalues

# pragma pylint: enable=redefined-builtin
# pragma pylint: enable=unused-wildcard-import
# pragma pylint: enable=wildcard-import

from copy import deepcopy
import json

from bson import json_util
from mongoengine import (
    Document,
    EmbeddedDocument,
)


class SerializableDocument(object):
    """Mixin for documents to support serializing and de-serializing"""

    meta = {"abstract": True}

    def __str__(self):
        return str(
            json.dumps(
                self.to_dict(extended=True),
                separators=(",", ": "),
                ensure_ascii=False,
                indent=4,
            )
        )

    def __copy__(self):
        return self.copy()

    def copy(self):
        """Returns a copy of the document that does not have its `id` set.

        Returns:
            a :class:`SerializableDocument`
        """
        doc = deepcopy(self)
        return doc

    def to_dict(self, extended=False):
        """Serializes this document to a JSON dictionary.

        Args:
            extended (False): whether to return extended JSON, i.e.,
                ObjectIDs, Datetimes, etc. are serialized

        Returns:
            a JSON dict
        """
        if extended:
            return json.loads(self.to_json())

        return json_util.loads(self.to_json())

    @classmethod
    def from_dict(cls, d, created=False, extended=False):
        """Loads the document from a JSON dictionary.

        Args:
            d: a JSON dictionary
            created (False): whether to consider the newly instantiated
                document as brand new or as persisted already. The following
                cases exist:

                    * If ``True``, consider the document as brand new, no
                      matter what data it is loaded with (i.e., even if an ID
                      is loaded)

                    * If ``False`` and an ID is NOT provided, consider the
                      document as brand new

                    * If ``False`` and an ID is provided, assume that the
                      object has already been persisted (this has an impact on
                      the subsequent call to ``.save()``)

            extended (False): if ``False``, ObjectIDs, Datetimes, etc. are
                expected to already be loaded

        Returns:
            a :class:`ODMDocument`
        """
        if not extended:
            try:
                # Attempt to load the document directly, assuming it is in
                # extended form
                return cls._from_son(d, created=created)
            except Exception:
                pass

        return cls.from_json(json_util.dumps(d), created=created)


class ODMEmbeddedDocument(SerializableDocument, EmbeddedDocument):
    """Base class to inherit from for a document that isn't stored in its own
    collection.
    """

    meta = {"abstract": True}


class ODMDocument(SerializableDocument, Document):
    """Base class to inherit from for documents that are stored in a MongoDB
    collection.

    ODMDocument.id implementation details:

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

    meta = {"abstract": True}

    def copy(self):
        """Returns a copy of the document that does not have its `id` set.

        Returns:
            a :class:`ODMDocument`
        """
        doc = super(ODMDocument, self).copy()
        doc.id = None
        return doc

    @property
    def ingest_time(self):
        """The time the document was added to the database, or ``None`` if it
        has not been added to the database.
        """
        return self.id.generation_time if self.in_db else None

    @property
    def in_db(self):
        """Whether the underlying :class:`fiftyone.core.odm.ODMDocument` has
        been inserted into the database.
        """
        return hasattr(self, "id") and self.id is not None
