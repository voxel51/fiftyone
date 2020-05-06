"""
Core module for serializable database documents.

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

    New instances of this class that have not yet been serialized to the
    database can be created by

    Args:
        document: an instance of the :class:`fiftyone.core.odm.ODMDocument`
            class specified by the class's ``_ODM_DOCUMENT_CLS`` constant
    """

    _ODM_DOCUMENT_CLS = foo.ODMDocument

    def __init__(self, document):
        etau.validate_type(document, self._ODM_DOCUMENT_CLS)
        self._doc = document

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
        if self._is_in_db():
            return str(self._doc.id)

        return None

    @property
    def ingest_time(self):
        """The time the document was added to the database, or ``None`` if it
        has not been added to the database.
        """
        if self._is_in_db():
            return self._doc.id.generation_time

        return None

    @classmethod
    def create_new(cls, *args, **kwargs):
        """Creates a new :class:`BackedByDocument` instance.

        Args:
            *args: subclass-specific positional arguments
            **kwargs: subclass-specific keyword arguments

        Returns:
            a :class:`BackedByDocument`
        """
        raise NotImplementedError("Subclass must implement create_new()")

    @classmethod
    def _create_new(cls, **kwargs):
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
        """Saves the underlying :class:`fiftyone.core.odm.ODMDocument` to the
        database.
        """
        self._doc.save()

    def _is_in_db(self):
        """Whether the underlying :class:`fiftyone.core.odm.ODMDocument` has
        been inserted into the database.

        Returns:
            True/False
        """
        return self._doc.id is not None
