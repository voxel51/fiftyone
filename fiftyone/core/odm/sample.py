"""
Backing document classes for :class:`fiftyone.core.sample.Sample` instances.

Class hierarchy::

    SerializableDocument
    ├── NoDatasetSampleDocument
    └── DatasetSampleDocument
        ├── my_custom_dataset
        ├── another_dataset
        └── ...

Design invariants:

-   A :class:`fiftyone.core.sample.Sample` always has a backing ``_doc`` that
    is an instance of :class:`fiftyone.core.odm.document.SerializableDocument`

-   A :class:`fiftyone.core.dataset.Dataset` always has a backing
    `_sample_doc_cls` that is a subclass of :class:`DatasetSampleDocument`

**Implementation details**

When a new :class:`fiftyone.core.sample.Sample` is created, its ``_doc``
attribute is an instance of :class:`NoDatasetSampleDocument`::

    import fiftyone as fo

    sample = fo.Sample()
    sample._doc  # NoDatasetSampleDocument

When a new :class:`fiftyone.core.dataset.Dataset` is created, its
``_sample_doc_cls`` attribute holds a dynamically created subclass of
:class:`DatasetSampleDocument` whose name is the name of the dataset's sample
collection::

    dataset = fo.Dataset(name="my_dataset")
    dataset._sample_doc_cls  # my_dataset(DatasetSampleDocument)

When a sample is added to a dataset, its ``_doc`` attribute is changed from
type :class:`NoDatasetSampleDocument` to type ``dataset._sample_doc_cls``::

    dataset.add_sample(sample)
    sample._doc  # my_dataset(DatasetSampleDocument)

| Copyright 2017-2024, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""
from collections import OrderedDict
import random

from bson import DBRef, ObjectId

import fiftyone.core.fields as fof
import fiftyone.core.metadata as fom
import fiftyone.core.media as fomm
import fiftyone.core.storage as fos

from .document import Document, SerializableDocument
from .mixins import DatasetMixin, get_default_fields, NoDatasetMixin


# Use our own Random object to avoid messing with the user's seed
_random = random.Random()


def _generate_rand(filepath=None):
    # @todo filepath no longer has to be unique. Should we change this?
    if filepath is not None:
        _random.seed(filepath)

    return _random.random() * 0.001 + 0.999


class DatasetSampleDocument(DatasetMixin, Document):
    """Base class for sample documents backing samples in datasets.

    All ``fiftyone.core.dataset.Dataset._sample_doc_cls`` classes inherit from
    this class.
    """

    meta = {"abstract": True}

    _is_frames_doc = False

    id = fof.ObjectIdField(required=True, primary_key=True, db_field="_id")
    filepath = fof.StringField(required=True)
    tags = fof.ListField(fof.StringField())
    metadata = fof.EmbeddedDocumentField(fom.Metadata, null=True)
    created_at = fof.DateTimeField(read_only=True)
    last_modified_at = fof.DateTimeField(read_only=True)

    _media_type = fof.StringField()
    _rand = fof.FloatField(default=_generate_rand)
    _dataset_id = fof.ObjectIdField()

    @property
    def media_type(self):
        return self._media_type

    def _get_repr_fields(self):
        fields = self.field_names
        return fields[:1] + ("media_type",) + fields[1:]


class NoDatasetSampleDocument(NoDatasetMixin, SerializableDocument):
    """Backing document for samples that have not been added to a dataset."""

    _is_frames_doc = False

    # pylint: disable=no-member
    default_fields = DatasetSampleDocument._fields
    default_fields_ordered = get_default_fields(
        DatasetSampleDocument, include_private=True
    )

    def __init__(self, **kwargs):
        filepath = fos.normalize_path(kwargs["filepath"])

        kwargs["id"] = kwargs.get("id", None)
        kwargs["filepath"] = filepath
        kwargs["created_at"] = None
        kwargs["last_modified_at"] = None
        kwargs["_rand"] = _generate_rand(filepath=filepath)
        kwargs["_media_type"] = fomm.get_media_type(filepath)
        kwargs["_dataset_id"] = None

        self._data = OrderedDict()

        for field_name in self.default_fields_ordered:
            value = kwargs.pop(field_name, None)

            if value is None and field_name not in ("id", "_dataset_id"):
                value = self._get_default(self.default_fields[field_name])

            self._data[field_name] = value

        self._data.update(kwargs)

    @property
    def media_type(self):
        return self._media_type

    def _get_repr_fields(self):
        fields = self.field_names
        return fields[:1] + ("media_type",) + fields[1:]



class DatasetSampleReferenceDocument(DatasetMixin, Document):
    meta = {"abstract": True}

    _is_frames_doc = False

    id = fof.ObjectIdField(required=True, primary_key=True, db_field="_id")
    _sample_id = fof.ReferenceField(DatasetSampleDocument, required=True)

    created_at = fof.DateTimeField(read_only=True)
    last_modified_at = fof.DateTimeField(read_only=True)
    _dataset_id = fof.ObjectIdField()

    @property
    def _sample_reference(self):
        return self._sample_id

    def get_field(self, field_name):
        try:
            return self._sample_reference.get_field(field_name)
        except AttributeError:
            pass

        return super().get_field(field_name)

    def set_field(self, field_name, value, create=True, validate=True, dynamic=False):
        if field_name in self._sample_reference.field_names:
            raise Exception("read only!!")
        return super().set_field(field_name, value, create, validate, dynamic)


class NoDatasetSampleReferenceDocument(NoDatasetMixin, SerializableDocument):
    _is_frames_doc = False

    # pylint: disable=no-member
    default_fields = DatasetSampleReferenceDocument._fields
    default_fields_ordered = get_default_fields(
        DatasetSampleReferenceDocument, include_private=True
    )

    _sample_reference = None

    @property
    def _sample_data(self):
        return self._sample_reference._data

    def get_field(self, field_name):
        try:
            return self._sample_reference.get_field(field_name)
        except AttributeError:
            pass
        return super().get_field(field_name)

    def set_field(self, field_name, value, create=True, validate=True, dynamic=False):
        if field_name in self._sample_reference.field_names:
            raise Exception("read only!!")
        return super().set_field(field_name, value, create, validate, dynamic)

    def __init__(self, sample, **kwargs):
        assert sample.in_dataset, "Sample must already be in dataset before creating reference"
        kwargs["id"] = kwargs.get("id", None)
        kwargs["media_type"] = sample.media_type
        kwargs["_sample_id"] = DBRef(sample._doc.collection_name, ObjectId(sample.id))

        self._sample_reference = sample

        self._data = OrderedDict()

        for field_name in self.default_fields_ordered:
            value = kwargs.pop(field_name, None)

            if value is None and field_name not in ("id", "_dataset_id", "_sample_id"):
                value = self._get_default(self.default_fields[field_name])

            self._data[field_name] = value
        
        self._data.update(kwargs)
