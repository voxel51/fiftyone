"""
Dataset run documents.

| Copyright 2017-2025, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""
from mongoengine import FileField

from fiftyone.core.fields import (
    DateTimeField,
    DictField,
    ListField,
    ObjectIdField,
    StringField,
)

from .document import Document


class RunDocument(Document):
    """Backing document for dataset runs."""

    # strict=False lets this class ignore unknown fields from other versions
    meta = {"collection": "runs", "strict": False}

    dataset_id = ObjectIdField(db_field="_dataset_id")
    key = StringField()
    version = StringField()
    timestamp = DateTimeField()
    config = DictField()
    view_stages = ListField(StringField(), default=None)
    results = FileField()
