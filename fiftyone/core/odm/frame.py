"""
Backing document classes for :class:`fiftyone.core.frame.Frame` instances.

| Copyright 2017-2025, Voxel51, Inc.
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

    _is_frames_doc = True

    id = fof.ObjectIdField(required=True, primary_key=True, db_field="_id")
    frame_number = fof.FrameNumberField(required=True)
    created_at = fof.DateTimeField(read_only=True)
    last_modified_at = fof.DateTimeField(read_only=True)

    _sample_id = fof.ObjectIdField(required=True)
    _dataset_id = fof.ObjectIdField()


class NoDatasetFrameDocument(NoDatasetMixin, SerializableDocument):

    _is_frames_doc = True

    # pylint: disable=no-member
    default_fields = DatasetFrameDocument._fields
    default_fields_ordered = get_default_fields(
        DatasetFrameDocument, include_private=True
    )

    def __init__(self, **kwargs):
        kwargs["created_at"] = None
        kwargs["last_modified_at"] = None
        kwargs["_sample_id"] = kwargs.pop("sample_id", None)
        kwargs["_dataset_id"] = None

        self._data = OrderedDict(
            [
                ("id", None),
                ("frame_number", None),
                ("created_at", None),
                ("last_modified_at", None),
                ("_sample_id", None),
                ("_dataset_id", None),
            ]
        )
        self._data.update(kwargs)
