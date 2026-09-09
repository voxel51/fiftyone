"""
Dataset run documents.

| Copyright 2017-2026, Voxel51, Inc.
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
    #: Facts that describe ``results`` — a count, a path — written when the
    #: results are saved so a reader can answer for them without pulling the
    #: blob out of GridFS.
    results_meta = DictField()
