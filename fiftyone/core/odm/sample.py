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

| Copyright 2017-2020, Voxel51, Inc.
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
import fiftyone.core.frame as fofr
import fiftyone.core.metadata as fom
import fiftyone.core.media as fomm
import fiftyone.core.utils as fou

from .dataset import SampleFieldDocument, DatasetDocument
from .document import (
    Document,
    SampleDocument,
)
from .mixins import (
    DatasetMixin,
    default_sample_fields,
    get_implied_field_kwargs,
    NoDatasetMixin,
)


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

    media_type = fof.StringField()
    # The path to the data on disk
    filepath = fof.StringField(unique=True)

    # The set of tags associated with the sample
    tags = fof.ListField(fof.StringField())

    # Metadata about the sample media
    metadata = fof.EmbeddedDocumentField(fom.Metadata, null=True)

    # Random float used for random dataset operations (e.g. shuffle)
    _rand = fof.FloatField(default=_generate_rand)

    def set_field(self, field_name, value, create=True):
        if field_name == "frames" and isinstance(value, fofr.Frames):
            value = value.doc.frames

        super().set_field(field_name, value, create=create)


class NoDatasetSampleDocument(NoDatasetMixin, SampleDocument):
    """Backing document for samples that have not been added to a dataset."""

    # pylint: disable=no-member
    default_fields = DatasetSampleDocument._fields
    default_fields_ordered = default_sample_fields(
        DatasetSampleDocument, include_private=True
    )

    def __init__(self, **kwargs):
        self._data = OrderedDict()
        filepath = os.path.abspath(
            os.path.expanduser(kwargs.get("filepath", None))
        )
        media_type = fomm.get_media_type(filepath)
        if "media_type" in kwargs and kwargs["media_type"] != media_type:
            raise fomm.MediaTypeError("media_type cannot be set")
        kwargs["media_type"] = media_type

        if media_type == fomm.VIDEO:
            kwargs["frames"] = {}

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

    def set_field(self, field_name, value, create=True):
        if field_name == "frames" and isinstance(value, fofr.Frames):
            value = value.doc.frames

        super().set_field(field_name, value, create=create)
