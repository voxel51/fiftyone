"""
Backing document classes for :class:`fiftyone.core.frame.Frame` instances.

Class hierarchy::

    SampleDocument
    ├── NoDatasetFrameSampleDocument
    └── DatasetFrameSampleDocument
        ├── my_custom_dataset
        ├── another_dataset
        └── ...

Design invariants:

-   A :class:`fiftyone.core.frame.Frame` always has a backing
    ``frame._doc``, which is an instance of a subclass of
    :class:`SampleDocument`

-   A :class:`fiftyone.core.dataset.Dataset` of media_type "video" always has
    a backing ``dataset._frame_doc_cls`` which is a subclass of
    :class:`DatasetFrameSampleDocument``.

**Implementation details**

When a new :class:`fiftyone.core.frame.Frame` is created, its ``_doc``
attribute is an instance of :class:`NoDatasetFrameSampleDocument`::

    import fiftyone as fo

    frame = fo.Frame()
    frame._doc  # NoDatasetFrameSampleDocument

When a new :class:`fiftyone.core.dataset.Dataset` is assigned the "video" media
type, its ``_frame_doc_cls`` attribute holds a dynamically created subclass of
:class:`DatasetFrameSampleDocument`::

    dataset = fo.Dataset(name="my_dataset")
    dataset._frame_doc_cls  # time stamped name

When a frame is added to a sample that is in a dataset, its ``_doc`` attribute
is changed from type :class:`NoDatasetSampleDocument` to type
``dataset._frame_doc_cls``::

    sample_in_dataset[frame_numer] = frame
    frame._doc.__name__  # sample.dataset._frame_doc_cls

| Copyright 2017-2020, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""
from collections import OrderedDict
import fiftyone.core.fields as fof

from .document import Document, SampleDocument
from .mixins import DatasetMixin, default_sample_fields, NoDatasetMixin


class DatasetFrameSampleDocument(DatasetMixin, Document, SampleDocument):

    meta = {"abstract": True}

    frame_number = fof.FrameNumberField(default=None, null=True)

    @classmethod
    def _sample_collection_name(cls):
        return ".".join(cls.__name__.split(".")[1:])

    @classmethod
    def _dataset_doc_fields_col(cls):
        return "frame_fields"


class NoDatasetFrameSampleDocument(NoDatasetMixin, SampleDocument):

    # pylint: disable=no-member
    default_fields = DatasetFrameSampleDocument._fields
    default_fields_ordered = default_sample_fields(
        DatasetFrameSampleDocument, include_private=True
    )

    def __init__(self, **kwargs):
        self._data = OrderedDict()
        for field_name in self.default_fields_ordered:

            value = kwargs.pop(field_name, None)

            if value is None:
                value = self._get_default(self.default_fields[field_name])

            self._data[field_name] = value

        self._data.update(kwargs)
