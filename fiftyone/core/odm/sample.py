"""
Backing document classes for :class:`fiftyone.core.sample.Sample` instances.

Class hierarchy::

    SampleDocument
    ├── NoDatasetSampleDocument
    └── DatasetSampleDocument
        ├── my_custom_dataset
        ├── another_dataset
        └── ...

Design invariants:

-   A :class:`fiftyone.core.sample.Sample` always has a backing
    ``sample._doc``, which is an instance of a subclass of
    :class:`SampleDocument`

-   A :class:`fiftyone.core.dataset.Dataset` always has a backing
    ``dataset._sample_doc_cls`` which is a subclass of
    :class:`DatasetSampleDocument``.

**Implementation details**

When a new :class:`fiftyone.core.sample.Sample` is created, its ``_doc``
attribute is an instance of :class:`NoDatasetSampleDocument`::

    import fiftyone as fo

    sample = fo.Sample()
    sample._doc  # NoDatasetSampleDocument

When a new :class:`fiftyone.core.dataset.Dataset` is created, its
``_sample_doc_cls`` attribute holds a dynamically created subclass of
:class:`DatasetSampleDocument` whose name is the name of the dataset::

    dataset = fo.Dataset(name="my_dataset")
    dataset._sample_doc_cls  # my_dataset(DatasetSampleDocument)

When a sample is added to a dataset, its ``_doc`` attribute is changed from
type :class:`NoDatasetSampleDocument` to type ``dataset._sample_doc_cls``::

    dataset.add_sample(sample)
    sample._doc  # my_dataset(DatasetSampleDocument)

| Copyright 2017-2021, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""
from collections import defaultdict, OrderedDict
from functools import wraps
import json
import numbers
import os
import random

from bson import json_util
from bson.binary import Binary
from mongoengine.errors import InvalidQueryError
import numpy as np
import six

import fiftyone as fo
import fiftyone.core.fields as fof
import fiftyone.core.frame_utils as fofu
import fiftyone.core.metadata as fom
import fiftyone.core.media as fomm
import fiftyone.core.utils as fou

from .dataset import SampleFieldDocument, DatasetDocument
from .document import Document, SampleDocument
from .mixins import DatasetMixin, get_default_fields, NoDatasetMixin


# Use our own Random object to avoid messing with the user's seed
_random = random.Random()


def _generate_rand(filepath=None):
    if filepath is not None:
        _random.seed(filepath)

    return _random.random() * 0.001 + 0.999


class DatasetSampleDocument(DatasetMixin, Document, SampleDocument):
    """Base class for sample documents backing samples in datasets.

    All ``fiftyone.core.dataset.Dataset._sample_doc_cls`` classes inherit from
    this class.
    """

    meta = {"abstract": True}

    filepath = fof.StringField(required=True)
    tags = fof.ListField(fof.StringField())
    metadata = fof.EmbeddedDocumentField(fom.Metadata, null=True)

    _media_type = fof.StringField()
    _rand = fof.FloatField(default=_generate_rand)

    @property
    def media_type(self):
        return self._media_type

    def _get_repr_fields(self):
        return ("id", "media_type") + self.field_names


class NoDatasetSampleDocument(NoDatasetMixin, SampleDocument):
    """Backing document for samples that have not been added to a dataset."""

    # pylint: disable=no-member
    default_fields = DatasetSampleDocument._fields
    default_fields_ordered = get_default_fields(
        DatasetSampleDocument, include_private=True
    )

    def __init__(self, **kwargs):
        self._data = OrderedDict()

        filepath = os.path.abspath(os.path.expanduser(kwargs["filepath"]))
        _media_type = fomm.get_media_type(filepath)
        kwargs["_media_type"] = _media_type

        for field_name in self.default_fields_ordered:
            value = kwargs.pop(field_name, None)

            if field_name == "_rand":
                value = _generate_rand(filepath=filepath)

            if value is None:
                value = self._get_default(self.default_fields[field_name])

            if field_name == "filepath":
                value = os.path.abspath(os.path.expanduser(value))

            self._data[field_name] = value

        self._data.update(kwargs)

    @property
    def media_type(self):
        return self._media_type

    def _get_repr_fields(self):
        return ("id", "media_type") + self.field_names
