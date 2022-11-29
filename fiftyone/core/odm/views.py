"""
Dataset view documents.

| Copyright 2017-2022, Voxel51, Inc.
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


class ViewDocument(Document):
    """Backing document for dataset views."""

    # strict=False lets this class ignore unknown fields from other versions
    meta = {"collection": "views", "strict": False}

    _EDITABLE_FIELDS = ("name", "color", "description")

    dataset_id = ObjectIdField()
    name = StringField()
    url_name = StringField()
    description = StringField()
    color = ColorField()
    view_stages = ListField(StringField())
    created_at = DateTimeField()
    last_modified_at = DateTimeField()
    last_loaded_at = DateTimeField()
