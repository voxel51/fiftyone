"""
Patches documents.

| Copyright 2017-2021, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""
from mongoengine import (
    BooleanField,
    ListField,
    StringField,
)

from .document import EmbeddedDocument


class PatchesDocument(EmbeddedDocument):
    """Description of the source of a patches dataset."""

    dataset = StringField()
    stages = ListField(StringField())
    field = StringField()
    keep_label_lists = BooleanField(default=False)
