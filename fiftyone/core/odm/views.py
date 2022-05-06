"""
Dataset view documents.

| Copyright 2017-2022, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""
from mongoengine import (
    ListField,
    ObjectIdField,
    StringField,
)

from .document import Document


class ViewDocument(Document):
    """Backing document for dataset views."""

    meta = {"collection": "views"}

    dataset_id = ObjectIdField()
    view_stages = ListField(StringField())
