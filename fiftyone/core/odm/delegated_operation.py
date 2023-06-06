"""
Dataset run documents.

| Copyright 2017-2023, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""

from fiftyone.core.fields import (
    DateTimeField,
    DictField,
    ListField,
    ObjectIdField,
    StringField,
)

from .document import Document


class DelegatedOperationDocument(Document):
    """Backing document for delegated operations."""

    # strict=False lets this class ignore unknown fields from other versions
    meta = {"collection": "delegated_ops", "strict": True}
    dataset_id = ObjectIdField(db_field="_dataset_id", required=False)
    delegation_target = StringField(required=False)
    operator = StringField(required=True)
    version = StringField()
    queued_at = DateTimeField(required=True)
    triggered_at = DateTimeField()
    started_at = DateTimeField()
    completed_at = DateTimeField()
    failed_at = DateTimeField()
    run_state = StringField(required=True)
    error_message = StringField()
    context = DictField()
    view_stages = ListField(StringField())
