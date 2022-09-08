"""
Dataset run documents.

| Copyright 2017-2022, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""
from mongoengine import (
    DictField,
    ListField,
    StringField,
    DateTimeField,
    FileField,
)

from .embedded_document import EmbeddedDocument


class RunDocument(EmbeddedDocument):
    """Description of a run on a dataset."""

    # strict=False lets this class ignore unknown fields from other versions
    meta = {"strict": False}

    key = StringField()
    version = StringField()
    timestamp = DateTimeField()
    config = DictField()
    view_stages = ListField(StringField())
    results = FileField()
