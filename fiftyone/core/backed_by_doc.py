"""

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
    # MongoEngine Document Type
    _ODM_DOCUMENT_TYPE = foo.ODMDocument

    def __init__(self, document):
        etau.validate_type(document, self._ODM_DOCUMENT_TYPE)
        self._doc = document

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
        if self._is_in_db():
            return str(self._doc.id)
        return None

    @property
    def ingest_time(self):
        """Document UTC generation/ingest time

        - automatically created when added to the database)
        - None, if it has not been added
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
