"""
Base classes for serializable database documents.

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

import eta.core.utils as etau

import fiftyone.core.odm as foo


class BackedByDocument(object):
    """Base class for objects that are serialized to the database.

    The constructor of all subclasses must take a single argument as input
    which is the :class:`fiftyone.core.odm.ODMDocument` describing the
    serialized content of the instance.

    New instances of :class:`BackedByDocument` subclasses can be created via
    the class's :func:`BackedByDocument.create` method.

    Use :func:`BackedByDocument.copy` to create a copy of a
    :class:`BackedByDocument` instance that has (or has not) been added to the
    database.

    Args:
        document: an instance of the :class:`fiftyone.core.odm.ODMDocument`
            class specified by the class's ``_ODM_DOCUMENT_CLS`` constant
    """

    _ODM_DOCUMENT_CLS = foo.ODMDocument

    def __init__(self, document):
        etau.validate_type(document, self._ODM_DOCUMENT_CLS)
        self._doc = document

    def __str__(self):
        return str(self._doc)

    def __copy__(self):
        return self.copy()

    @property
    def id(self):
        """The ID of the document, or ``None`` if it has not been added to the
        database.

        **Implementation details**

        The ID is a 12 byte value consisting of the concatentation of the
        following:

        - a 4 byte timestamp representing the document's commit time,
          measured in seconds since epoch

        - a 5 byte random value

        - a 3 byte incrementing counter, initialized to a random value
        """
        return str(self._doc.id) if self._in_db else None

    @property
    def ingest_time(self):
        """The time the document was added to the database, or ``None`` if it
        has not been added to the database.
        """
        return self._doc.id.generation_time if self._in_db else None

    @property
    def _backing_doc(self):
        """The backing :class:`fiftyone.core.odm.ODMDocument` for the object.
        """
        return self._doc

    @property
    def _in_db(self):
        """Whether the underlying :class:`fiftyone.core.odm.ODMDocument` has
        been inserted into the database.
        """
        return self._doc.id is not None

    def copy(self):
        """Returns a copy of the document that has not been added to the
        database.

        Returns:
            a :class:`BackedByDocument`
        """
        return self.__class__(self._backing_doc.copy())

    def get_backing_doc_dict(self, extended=False):
        """Returns a JSON dict representation of the document.

        Args:
            extended (False): whether to return extended JSON, i.e.,
                ObjectIDs, Datetimes, etc. are serialized

        Returns:
            a JSON dict
        """
        return self._doc.to_dict(extended=extended)

    def get_backing_doc_json(self):
        """Returns a JSON string representation of the document.

        Returns:
            a JSON string
        """
        return self._doc.to_json()

    @classmethod
    def create(cls, *args, **kwargs):
        """Creates a :class:`BackedByDocument` instance.

        Args:
            *args: subclass-specific positional arguments
            **kwargs: subclass-specific keyword arguments

        Returns:
            a :class:`BackedByDocument`
        """
        raise NotImplementedError("Subclass must implement create()")

    @classmethod
    def _create(cls, **kwargs):
        """Internal method that creates a :class:`BackedByDocument` instance
        from keyword arguments for its underlying
        :class:`fiftyone.core.odm.ODMDocument`.

        Args:
            **kwargs: keyword arguments for
                ``cls._ODM_DOCUMENT_CLS.__init__(**kwargs)``

        Returns:
            a :class:`BackedByDocument`
        """
        return cls(cls._ODM_DOCUMENT_CLS(**kwargs))

    def _save(self):
        """Saves the document to the database."""
        self._doc.save()

    def _delete(self):
        """Deletes the document from the database."""
        self._doc.delete()
