"""
Backing document classes for :class:`fiftyone.core.frame.Frame` instances.

| Copyright 2017-2021, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""
from collections import OrderedDict

from bson import ObjectId

import fiftyone.core.fields as fof

from .document import Document, SerializableDocument
from .mixins import DatasetMixin, get_default_fields, NoDatasetMixin


class DatasetFrameDocument(DatasetMixin, Document):

    meta = {"abstract": True}

    id = fof.ObjectIdField(required=True, primary_key=True, db_field="_id")
    frame_number = fof.FrameNumberField(required=True)

    _sample_id = fof.ObjectIdField(required=True)

    _dataset_doc_fields_col = "frame_fields"
    _is_frames_doc = True


class NoDatasetFrameDocument(NoDatasetMixin, SerializableDocument):

    # pylint: disable=no-member
    default_fields = DatasetFrameDocument._fields
    default_fields_ordered = get_default_fields(
        DatasetFrameDocument, include_private=True
    )

    _is_frames_doc = True

    def __init__(self, **kwargs):
        self._data = OrderedDict(
            [("id", None), ("frame_number", None), ("_sample_id", None)]
        )
        self._data.update(kwargs)
