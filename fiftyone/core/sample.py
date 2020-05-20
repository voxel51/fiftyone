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
import logging

import fiftyone.core.odm as foo


class Sample(object):
    """A sample in a :class:`fiftyone.core.dataset.Dataset`.

    Samples store all information associated with a particular piece of data in
    a dataset, including basic metadata about the data, one or more sets of
    labels (ground truth, user-provided, or FiftyOne-generated), and additional
    features associated with subsets of the data and/or label sets.

    Args:
        filepath: the path to the data on disk
        tags (None): the set of tags associated with the sample
        metadata (None): a :class:`fiftyone.core.metadata.Metadata` instance
        **kwargs: additional fields to dynamically set on the sample
    """

    def __init__(self, filepath, tags=None, metadata=None, **kwargs):
        self._doc = foo.ODMNoDatasetSample(
            filepath=filepath, tags=tags, metadata=metadata, **kwargs
        )

    def __str__(self):
        return str(self._doc)

    def __getattr__(self, name):
        try:
            return super(Sample, self).__getattribute__(name)
        except AttributeError:
            return self._doc.get_field(name)

    def __setattr__(self, name, value):
        if name.startswith("_") or (
            hasattr(self, name) and name not in self._doc.field_names
        ):
            super(Sample, self).__setattr__(name, value)
        else:
            self._doc.__setattr__(name, value)

    def __delattr__(self, name):
        # @todo(Tyler)
        raise NotImplementedError("Not yet implemented")

    def __getitem__(self, key):
        return self.get_field(key)

    def __setitem__(self, key, value):
        return self.set_field(key, value=value, create=True)

    def __delitem__(self, key):
        return self.clear_field(key)

    def __copy__(self):
        return self.copy()

    @property
    def filename(self):
        """The basename of the data filepath."""
        return os.path.basename(self.filepath)

    @property
    def id(self):
        """The ID of the document, or ``None`` if it has not been added to the
        database.
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
        """Returns a schema dictionary describing the fields of this sample.

        If the sample belongs to a dataset, the schema applies to all samples
        in the dataset. Sample fields are synchronized across all samples in a
        dataset and default to `None` if not explicitly set.

        Args:
            ftype (None): an optional field type to which to restrict the
                returned schema. Must be a subclass of
                ``mongoengine.fields.BaseField``

        Returns:
             a dictionary mapping field names to field types
        """
        return self._doc.get_field_schema(ftype=ftype)

    def get_field(self, field_name):
        """Accesses the value of a field of the sample.

        Args:
            field_name: the field name

        Returns:
            the field value

        Raises:
            AttributeError: if the field does not exist
        """
        return self._doc.get_field(field_name)

    def set_field(self, field_name, value, create=False):
        """Sets the value of a field of the sample.

        Args:
            field_name: the field name
            value: the field value
            create (False): whether to create the field if it does not exist

        Raises:
            ValueError: if ``field_name`` is not an allowed field name or does
                not exist and ``create == False``
        """
        if (
            hasattr(self, field_name)
            and field_name not in self._doc.field_names
        ):
            raise ValueError("Cannot use reserved keyword '%s'" % field_name)

        return self._doc.set_field(field_name, value, create=create)

    def clear_field(self, field_name):
        """Clears the value of a field of the sample.

        Args:
            field_name: the name of the field to clear

        Raises:
            AttributeError: if the field does not exist
        """
        return self._doc.clear_field(field_name=field_name)

    def copy(self):
        """Returns a copy of the sample that has not been added to the
        database.

        Returns:
            a :class:`Sample`
        """
        return self.__class__(**self._doc.copy().to_dict())

    def to_dict(self, extended=False):
        """Serializes the sample to a JSON dictionary.

        Args:
            extended (False): whether to return extended JSON, i.e.,
                ObjectIDs, Datetimes, etc. are serialized

        Returns:
            a JSON dict
        """
        return self._doc.to_dict(extended=extended)

    @classmethod
    def from_dict(cls, doc_class, d, created=False, extended=False):
        """Loads the sample from a JSON dictionary.

        Args:
            doc_class:
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
            a :class:`Sample`
        """
        doc = doc_class.from_dict(d, created=created, extended=extended)
        return cls.from_doc(doc)

    def to_json(self):
        """Returns a JSON string representation of the sample.

        Returns:
            a JSON string
        """
        return self._doc.to_json()

    @classmethod
    def from_doc(cls, doc):
        """Creates an instance of the :class:`Sample` class backed by the given
        document.

        Args:
            document: a :class:`fiftyone.core.odm.ODMDatasetSample`

        Returns:
            a :class:`Sample`
        """
        if not isinstance(doc, foo.ODMDatasetSample):
            raise TypeError("Unexpected doc type: %s" % type(doc))

        sample = cls.__new__(cls)
        sample._doc = doc
        return sample

    def save(self):
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
