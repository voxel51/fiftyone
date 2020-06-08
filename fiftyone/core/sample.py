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
from future.utils import itervalues

# pragma pylint: enable=redefined-builtin
# pragma pylint: enable=unused-wildcard-import
# pragma pylint: enable=wildcard-import

from collections import defaultdict
from copy import deepcopy
import json
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
        tags (None): a list of tags for the sample
        metadata (None): a :class:`fiftyone.core.metadata.Metadata` instance
        **kwargs: additional fields to dynamically set on the sample
    """

    # Instance references keyed by [dataset_name][sample_id]
    _instances = defaultdict(weakref.WeakValueDictionary)

    def __init__(self, filepath, tags=None, metadata=None, **kwargs):
        self._doc = foo.ODMNoDatasetSample(
            filepath=filepath, tags=tags, metadata=metadata, **kwargs
        )

        # maintain a reference to the dataset
        self._dataset = self._get_dataset()

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
        try:
            self.__delitem__(name)
        except KeyError:
            super(Sample, self).__delattr__(name)

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
        except ValueError as e:
            raise KeyError(e.args[0])

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

    @property
    def field_names(self):
        """An ordered list of the names of the fields of this sample."""
        return self._doc.field_names

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
            ValueError: if the field does not exist
        """
        return self._doc.clear_field(field_name=field_name)

    def copy(self):
        """Returns a deep copy of the sample that has not been added to the
        database.

        Returns:
            a :class:`Sample`
        """
        kwargs = {f: deepcopy(getattr(self._doc, f)) for f in self.field_names}
        return self.__class__(**kwargs)

    def clone_doc(self, doc_cls=None):
        """Returns a deep clone of the backing document of the sample.

        Args:
            doc_cls (None): a :class:`fiftyone.core.odm.ODMSample` class to
                use for the backing document. By default, the backing document
                class of the sample is used

        Returns:
            a :class:`fiftyone.core.odm.ODMSample`
        """
        if doc_cls is None:
            doc_cls = self._doc.__class__

        kwargs = {f: deepcopy(getattr(self._doc, f)) for f in self.field_names}
        return doc_cls(**kwargs)

    def to_dict(self, extended=False, include_id=True):
        """Serializes the sample to a JSON dictionary.

        Args:
            extended (False): whether to serialize extended JSON constructs
                such as ObjectIDs, Binary, etc. into JSON format
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
    def from_dict(cls, d, doc_cls=None, extended=False):
        """Loads the sample from a JSON dictionary.

        Args:
            d: a JSON dictionary
            doc_cls (None): the :class:`fiftyone.core.odm.ODMSample` class to
                use to load the backing document. By default,
                :class:`fiftyone.core.odm.ODMNoDatasetSample` is used
            extended (False): whether the input dictionary contains extended
                JSON

        Returns:
            a :class:`Sample`
        """
        if doc_cls is None:
            doc_cls = foo.ODMNoDatasetSample

        doc = doc_cls.from_dict(d, extended=extended)
        return cls.from_doc(doc)

    def to_json(self):
        """Returns a JSON string representation of the sample.

        Returns:
            a JSON string
        """
        return self._doc.to_json()

    @classmethod
    def from_json(cls, s, doc_cls=None):
        """Loads the sample from a JSON string.

        Args:
            s: the JSON string
            doc_cls (None): the :class:`fiftyone.core.odm.ODMSample` class to
                use to load the backing document. By default,
                :class:`fiftyone.core.odm.ODMNoDatasetSample` is used

        Returns:
            a :class:`Sample`
        """
        d = json.loads(s)
        return cls.from_dict(d, doc_cls=doc_cls, extended=True)

    @classmethod
    def from_doc(cls, doc):
        """Creates an instance of the :class:`Sample` class backed by the given
        document.

        Args:
            document: a :class:`fiftyone.core.odm.ODMSample`

        Returns:
            a :class:`Sample`
        """
        if isinstance(doc, foo.ODMNoDatasetSample):
            sample = cls.__new__(cls)
            sample._doc = doc
            return sample

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
        """Saves the sample to the database."""
        self._doc.save()

    def reload(self):
        """Reload the sample from the database."""
        self._doc.reload()

    @classmethod
    def _save_dataset_samples(cls, dataset_name):
        """Saves all changes to samples instances in memory belonging to the
        specified dataset to the database.
        A samples only needs to be saved if it has non-persisted changes and
        still exists in memory.
        Args:
            dataset_name: the name of the dataset to save.
        """
        for sample in cls._instances[dataset_name].values():
            sample.save()

    @classmethod
    def _reload_dataset_samples(cls, dataset_name):
        """Reloads the fields for sample instances in memory belonging to the
        specified dataset from the database.
        If multiple processes or users are accessing the same database this
        will keep the dataset in sync.
        Args:
            dataset_name: the name of the dataset to reload.
        """
        for sample in cls._instances[dataset_name].values():
            sample.reload()

    def _delete(self):
        """Deletes the document from the database."""
        self._doc.delete()

    @property
    def _in_db(self):
        """Whether the underlying :class:`fiftyone.core.odm.ODMDocument` has
        been inserted into the database.
        """
        return self._doc.in_db

    def _get_dataset(self):
        if self._in_db:
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

        # ensure the doc is saved to the database
        if not doc.id:
            doc.save()

        self._doc = doc

        # save weak reference
        dataset_instances = self._instances[doc.dataset_name]
        if self.id not in dataset_instances:
            dataset_instances[self.id] = self

        self._dataset = self._get_dataset()

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
        if dataset_name not in cls._instances:
            return

        dataset_instances = cls._instances.pop(dataset_name)
        for sample in itervalues(dataset_instances):
            sample._doc = sample.copy()._doc
