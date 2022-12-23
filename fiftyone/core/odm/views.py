"""
Saved view documents.

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
    ObjectId,
)

from .document import Document


class SavedViewDocument(Document):
    """Backing document for saved views."""

    # strict=False lets this class ignore unknown fields from other versions
    meta = {"collection": "views", "strict": False}

    _EDITABLE_FIELDS = ("name", "color", "description")

    dataset_id = ObjectIdField(db_field="_dataset_id")
    name = StringField()
    slug = StringField()
    description = StringField()
    color = ColorField()
    view_stages = ListField(StringField())
    created_at = DateTimeField()
    last_modified_at = DateTimeField()
    last_loaded_at = DateTimeField()

    def serialize(self):
        d = self.to_dict()

        # TODO: remove nested get when ready to merge
        d["id"] = str(d.get("_id", d.get("id", ObjectId())))
        d["dataset_id"] = str(d.get("_dataset_id", d.get("dataset_id", "")))
        return d
