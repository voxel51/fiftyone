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
import eta.core.utils as etau

import fiftyone.core.odm as foo


class BackedByDocument(object):
    """Base class for objects that are serialized to the database.

    This class adds functionality to ``eta.core.serial.Serializable`` to
    provide `_id` and `_collection` fields which are populated when a document
    is added to the database.
    """

    # MongoEngine Document Type
    _ODM_DOCUMENT_TYPE = foo.ODMDocument

    def __init__(self, document):
        etau.validate_type(document, self._ODM_DOCUMENT_TYPE)
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
        """Creates a new instance of `BackedByDocument` that does not already
        have an existing _ODM_DOCUMENT_TYPE instance.
        """
        odm_kwargs = cls.get_odm_kwargs(*args, **kwargs)
        return cls(document=cls._ODM_DOCUMENT_TYPE(**odm_kwargs))

    @staticmethod
    def get_odm_kwargs(*args, **kwargs):
        raise NotImplementedError("Subclass must implement get_kwargs()")

    def _save(self):
        self._doc.save()

    def _is_in_db(self):
        """Returns True if the ODMDocument has been inserted into the database
        """
        return self._doc.id is not None
