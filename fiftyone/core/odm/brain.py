"""
Brain documents.

| Copyright 2017-2021, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""
from mongoengine import DictField, ListField, StringField, DateTimeField

from .document import EmbeddedDocument


class BrainDocument(EmbeddedDocument):
    """Description of a brain method run."""

    brain_key = StringField()
    timestamp = DateTimeField()
    config = DictField()
    view_stages = ListField(StringField())
