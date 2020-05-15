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
import six

from mongoengine.errors import InvalidDocumentError

import eta.core.image as etai

import fiftyone.core.labels as fol
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
        self._doc = {
            "filepath": filepath,
            "tags": tags,
            "metadata": metadata,
        }
        self._doc.update(kwargs)

    def __str__(self):
        return str(self._doc)

    @property
    def filename(self):
        """The name of the raw data file on disk."""
        return os.path.basename(self.filepath)

    @property
    def in_dataset(self):
        # @todo(Tyler)
        raise NotImplementedError("TODO")

    @property
    def dataset_name(self):
        # @todo(Tyler)
        raise NotImplementedError("TODO")

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
        if name in self._doc.fields:
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

    @classmethod
    def from_doc(cls, doc):
        sample = cls.__new__(cls)
        sample._doc = doc
        return sample

    def _save(self):
        """Saves the document to the database."""
        self._doc.save()

    def _delete(self):
        """Deletes the document from the database."""
        self._doc.delete()
