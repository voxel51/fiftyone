"""
Singleton document that maintains global fiftyone database state.

| Copyright 2017-2021, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""
from mongoengine import StringField

from .document import Document, EmbeddedDocument


class MetaDocument(Document):
    """Backing singleton document for global fiftyone database state."""

    meta = {"collection": "meta"}

    version = StringField(required=True)
