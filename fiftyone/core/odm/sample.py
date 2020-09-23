"""
Backing document classes for :class:`fiftyone.core.sample.Sample` instances.

Class hierarchy::

    DatasetSampleDocument
      ├── my_custom_dataset
      ├── another_dataset
      └── ...

**Implementation details**

When a new :class:`fiftyone.core.dataset.Dataset` is created, its
``_schema._sample_doc_cls`` attribute holds a dynamically created subclass of
:class:`DatasetSampleDocument` whose name is the name of the dataset::

    dataset = fo.Dataset(name="my_dataset")

| Copyright 2017-2020, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""
import random

import fiftyone.core.fields as fof
import fiftyone.core.metadata as fom

from .document import Document


# Use our own Random object to avoid messing with the user's seed
_random = random.Random()


def _generate_rand(filepath=None):
    if filepath is not None:
        _random.seed(filepath)

    return _random.random() * 0.001 + 0.999


class DatasetSampleDocument(Document):
    """Base class for sample documents backing samples in datasets.

    All ``fiftyone.core.dataset.DatasetHelper._sample_doc_cls`` classes inherit
    from this class.
    """

    meta = {"abstract": True}

    # The path to the data on disk
    filepath = fof.StringField(unique=True)

    # The set of tags associated with the sample
    tags = fof.ListField(fof.StringField())

    # Metadata about the sample media
    metadata = fof.EmbeddedDocumentField(fom.Metadata, null=True)

    mtype = fof.StringField()

    # Random float used for random dataset operations (e.g. shuffle)
    _rand = fof.FloatField(default=_generate_rand)

    _fields_ordered = []

    @classmethod
    def _get_fields_ordered(cls, include_private=False):
        if include_private:
            return cls._fields_ordered
        return tuple(f for f in cls._fields_ordered if not f.startswith("_"))
