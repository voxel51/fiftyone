"""
Backing document classes for :class:`fiftyone.core.frame.Frame` instances.

| Copyright 2017-2023, Voxel51, Inc.
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

    _sample_id = fof.ObjectIdField(required=True)


class NoDatasetFrameDocument(NoDatasetMixin, SerializableDocument):

    _is_frames_doc = True

    # pylint: disable=no-member
    default_fields = DatasetFrameDocument._fields
    default_fields_ordered = get_default_fields(
        DatasetFrameDocument, include_private=True
    )

    def __init__(self, **kwargs):
        # If we're loading a serialized dict with a sample ID, it will come in
        # as `sample_id` here
        sample_id = kwargs.pop("sample_id", None)

        self._data = OrderedDict(
            [("id", None), ("frame_number", None), ("_sample_id", sample_id)]
        )
        self._data.update(kwargs)
