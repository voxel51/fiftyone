"""
Dataset run documents.

| Copyright 2017-2021, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""
from mongoengine import (
    DictField,
    ListField,
    ReferenceField,
    StringField,
    DateTimeField,
    FileField,
)

from .document import EmbeddedDocument


class RunDocument(EmbeddedDocument):
    """Description of a run on a dataset."""

    key = StringField()
    version = StringField()
    timestamp = DateTimeField()
    config = DictField()
    view_stages = ListField(StringField())
    results = FileField()
