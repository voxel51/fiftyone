"""
Backing document classes for :class:`fiftyone.core.frame.Frame` instances.

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

    _sample_id = fof.ObjectIdField(default=None, required=True)
    frame_number = fof.FrameNumberField(required=True)

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

            if value is None and field_name != "_sample_id":
                value = self._get_default(self.default_fields[field_name])

            self._data[field_name] = value

        self._data.update(kwargs)
