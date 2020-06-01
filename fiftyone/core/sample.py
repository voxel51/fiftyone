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

# pragma pylint: enable=redefined-builtin
# pragma pylint: enable=unused-wildcard-import
# pragma pylint: enable=wildcard-import
from future.utils import itervalues

from collections import defaultdict
import os
import weakref

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

    # Instance references keyed by [dataset_name][sample_id]
    _instances = defaultdict(weakref.WeakValueDictionary)

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
            hasattr(self, name) and not self._doc.has_field(name)
        ):
            super(Sample, self).__setattr__(name, value)
        else:
            self._doc.__setattr__(name, value)

    def __delattr__(self, name):
        # @todo(Tyler) __delattr__
        raise NotImplementedError("Not yet implemented")

    def __getitem__(self, key):
        try:
            return self.get_field(key)
        except AttributeError:
            raise KeyError("Sample has no field '%s'" % key)

    def __setitem__(self, key, value):
        return self.set_field(key, value=value, create=True)

    def __delitem__(self, key):
        try:
            return self.clear_field(key)
        except AttributeError:
            raise KeyError("Sample has no field '%s'" % key)

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

    def get_field_schema(self, ftype=None, embedded_doc_type=None):
        """Returns a schema dictionary describing the fields of this sample.

        If the sample belongs to a dataset, the schema will apply to all
        samples in the dataset.

        Args:
            ftype (None): an optional field type to which to restrict the
                returned schema. Must be a subclass of
                :class:``fiftyone.core.fields.Field``
            embedded_doc_type (None): an optional embedded document type to
                which to restrict the returned schema. Must be a subclass of
                :class:``fiftyone.core.odm.ODMEmbeddedDocument``

        Returns:
             a dictionary mapping field names to field types
        """
        return self._doc.get_field_schema(
            ftype=ftype, embedded_doc_type=embedded_doc_type
        )

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
        if hasattr(self, field_name) and not self._doc.has_field(field_name):
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

    def to_dict(self, extended=False, include_id=True):
        """Serializes the sample to a JSON dictionary.

        Args:
            extended (False): whether to return extended JSON, i.e.,
                ObjectIDs, Datetimes, etc. are serialized
            include_id (True): whether to include the ID of the sample in the
                serialized dictionary

        Returns:
            a JSON dict
        """
        d = self._doc.to_dict(extended=extended)
        if not include_id:
            d.pop("_id", None)

        return d

    @classmethod
    def from_dict(cls, doc_class, d, created=False, extended=False):
        """Loads the sample from a JSON dictionary.

        Args:
            doc_class: the :class:`fiftyone.core.odm.ODMSample` class to use
                to load the backing document
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
        if isinstance(doc, foo.ODMNoDatasetSample):
            sample = cls.__new__(cls)
            sample._doc = doc
            return sample

        if not isinstance(doc, foo.ODMDatasetSample):
            raise TypeError("Unexpected doc type: %s" % type(doc))

        if not doc.id:
            raise ValueError("`doc` is not saved to the database.")

        try:
            # get instance if exists
            sample = cls._instances[doc.dataset_name][str(doc.id)]
        except KeyError:
            sample = cls.__new__(cls)
            sample._doc = None  # set to prevent RecursionError
            sample._set_backing_doc(doc)

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

    def _set_backing_doc(self, doc):
        """Updates the backing doc for the sample.

        For use **only** when adding a sample to a dataset.
        """
        if isinstance(self._doc, foo.ODMDatasetSample):
            raise TypeError("Sample already belongs to a dataset")

        if not isinstance(doc, foo.ODMDatasetSample):
            raise TypeError(
                "Backing doc must be an instance of %s; found %s"
                % (foo.ODMDatasetSample, type(doc))
            )

        self._doc = doc

        # ensure the doc is saved to the database
        if not doc.id:
            doc.save()

        # save weak reference
        dataset_instances = self._instances[doc.dataset_name]
        if self.id not in dataset_instances:
            dataset_instances[self.id] = self

    @classmethod
    def _reset_backing_docs(cls, dataset_name, sample_ids):
        """Resets the sample's backing document to a
        :class:`fiftyone.core.odm.ODMNoDatasetSample` instance.

        For use **only** when removing samples from a dataset.
        """
        dataset_instances = cls._instances[dataset_name]
        for sample_id in sample_ids:
            sample = dataset_instances.pop(sample_id, None)
            if sample is not None:
                sample._doc = sample.copy()._doc

    @classmethod
    def _reset_all_backing_docs(cls, dataset_name):
        """Resets the sample's backing document to a
        :class:`fiftyone.core.odm.ODMNoDatasetSample` instance for all samples
        in a dataset.

        For use **only** when clearing a dataset.
        """
        dataset_instances = cls._instances.pop(dataset_name)
        for sample in itervalues(dataset_instances):
            sample._doc = sample.copy()._doc
