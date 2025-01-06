"""
Saved view documents.

| Copyright 2017-2025, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""
from fiftyone.core.fields import (
    ColorField,
    DateTimeField,
    ListField,
    ObjectIdField,
    StringField,
)

from .document import Document


class SavedViewDocument(Document):
    """Backing document for saved views."""

    # strict=False lets this class ignore unknown fields from other versions
    meta = {"collection": "views", "strict": False}

    _EDITABLE_FIELDS = ("name", "color", "description")

    dataset_id = ObjectIdField(db_field="_dataset_id")
    name = StringField()
    description = StringField()
    slug = StringField()
    color = ColorField()
    view_stages = ListField(StringField())
    created_at = DateTimeField()
    last_modified_at = DateTimeField()
    last_loaded_at = DateTimeField()
