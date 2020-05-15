"""
Dataset samples.

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
from future.utils import iteritems

# pragma pylint: enable=redefined-builtin
# pragma pylint: enable=unused-wildcard-import
# pragma pylint: enable=wildcard-import

import os

import fiftyone.core.odm as foo


class Sample(object):
    """A sample in a :class:`fiftyone.core.dataset.Dataset`.

    Samples store all information associated with a particular piece of data in
    a dataset, including basic metadata about the data, one or more sets of
    labels (ground truth, user-provided, or FiftyOne-generated), and additional
    features associated with subsets of the data and/or label sets.

    Args:
        document: a :class:`fiftyone.core.odm.ODMSample`
    """

    def __init__(self, filepath, tags=None, metadata=None, **kwargs):
        """Creates a :class:`Sample` instance.

        Args:
            filepath: the path to the data on disk
            tags (None): the set of tags associated with the sample
            metadata (None): @todo(Tyler)
            kwargs: @todo(Tyler)
        """
        self._doc = foo.ODMNoDatasetSample(
            filepath=filepath, tags=tags, metadata=metadata, **kwargs
        )

    def __str__(self):
        return str(self._doc)

    @property
    def filename(self):
        """The name of the raw data file on disk."""
        return os.path.basename(self.filepath)

    @property
    def id(self):
        """The ID of the document, or ``None`` if it has not been added to the
        database.

        **Implementation details**

        The ID is a 12 byte value consisting of the concatenation of the
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
        return self._doc.ingest_time

    @property
    def in_dataset(self):
        """Whether the sample has been added to a dataset."""
        return self.dataset_name is not None

    @property
    def dataset_name(self):
        """The name of the dataset to which this sample belongs, or ``None`` if
        it has not been added to a dataset.
        """
        return self._doc.dataset_name

    def get_field_schema(self, ftype=None):
        """@todo(Tyler)"""
        return self._doc.get_field_schema(ftype=ftype)

    def get_field(self, field_name):
        """@todo(Tyler)"""
        return self._doc.get_field(field_name=field_name)

    def set_field(self, field_name, value, create=False):
        """@todo(Tyler)"""
        if hasattr(self, field_name):
            raise ValueError("Cannot set reserve word '%s'" % field_name)
        return self._doc.set_field(field_name, value, create=create)

    def __getattr__(self, name):
        if name not in dir(self) and name in self.get_field_schema():
            return self._doc.__getattribute__(name)
        return super(Sample, self).__getattribute__(name)

    def __setattr__(self, name, value):
        if name.startswith("_"):
            return super(Sample, self).__setattr__(name, value)
        # @todo(Tyler)
        raise NotImplementedError("TODO")

    def __getitem__(self, key):
        return self.get_field(field_name=key)

    def __setitem__(self, key, value):
        return self.set_field(field_name=key, value=value, create=True)

    def __copy__(self):
        return self.copy()

    def copy(self):
        """Returns a copy of the sample that has not been added to the
        database.

        Returns:
            a :class:`Sample`
        """
        return self.__class__(**self._doc.copy().to_dict())

    def to_dict(self, extended=False):
        """Serializes this document to a JSON dictionary.

        Args:
            extended (False): whether to return extended JSON, i.e.,
                ObjectIDs, Datetimes, etc. are serialized

        Returns:
            a JSON dict
        """
        return self._doc.to_dict(extended=extended)

    @classmethod
    def from_dict(cls, doc_class, d, created=False, extended=False):
        """Loads the document from a JSON dictionary.

        Args:
            d: a JSON dictionary
            doc_class
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
        doc = doc_class.from_dict(d, created=created, extended=extended)
        return cls.from_doc(doc)

    def to_json(self):
        """Returns a JSON string representation of the document.

        Returns:
            a JSON string
        """
        return self._doc.to_json()

    @classmethod
    def from_doc(cls, doc):
        """Creates an instance of the :class:`fiftyone.core.sample.Sample`
        class backed by the given document.

        Args:
            document: an :class:`fiftyone.core.odm.ODMDatasetSample` instance
        """
        if not isinstance(doc, foo.ODMDatasetSample):
            raise TypeError("Unexpected doc type: %s" % type(doc))
        sample = cls.__new__(cls)
        sample._doc = doc
        return sample

    def _save(self):
        """Saves the document to the database."""
        self._doc.save()

    def _delete(self):
        """Deletes the document from the database."""
        self._doc.delete()

    @property
    def _in_db(self):
        """Whether the underlying :class:`fiftyone.core.odm.ODMDocument` has
        been inserted into the database.
        """
        return self._doc.in_db

    @property
    def _dataset(self):
        if self._in_db:
            # @todo(Tyler) should this import be cached?
            from fiftyone.core.dataset import load_dataset

            return load_dataset(self.dataset_name)
        return None
