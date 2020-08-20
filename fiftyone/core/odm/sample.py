"""
Backing document classes for :class:`fiftyone.core.sample.Sample` instances.

Class hierarchy::

    SampleDocument
    └── DatasetSampleDocument
        ├── my_custom_dataset
        ├── another_dataset
        └── ...

Design invariants:

-   A :class:`fiftyone.core.sample.Sample` always has a backing
    ``sample._doc``, which is an instance of a subclass of
    :class:`SampleDocument`

**Implementation details**

When a new :class:`fiftyone.core.sample.Sample` is created, its ``_doc``
attribute is `None`

    import fiftyone as fo

    sample = fo.Sample()
    sample._doc  # None

When a new :class:`fiftyone.core.dataset.Dataset` is created, its
``_sample_doc_cls`` attribute holds a dynamically created subclass of
:class:`DatasetSampleDocument` whose name is the name of the dataset::

    dataset = fo.Dataset(name="my_dataset")

When a sample is added to a dataset, its ``_doc`` attribute is changed from


    dataset.add_sample(sample)
    sample._doc  # my_dataset(DatasetSampleDocument)

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


def default_sample_fields(include_private=False):
    """The default fields present on all :class:`SampleDocument` objects.

    Args:
        include_private (False): whether to include fields that start with `_`

    Returns:
        a tuple of field names
    """
    if include_private:
        return DatasetSampleDocument._fields_ordered
    return tuple(
        f
        for f in DatasetSampleDocument._fields_ordered
        if not f.startswith("_")
    )


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

    # Random float used for random dataset operations (e.g. shuffle)
    _rand = fof.FloatField(default=_generate_rand)
