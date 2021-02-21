"""
Evaluation documents.

| Copyright 2017-2021, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""
from mongoengine import DictField, ListField, StringField, DateTimeField

from .document import EmbeddedDocument


class EvaluationDocument(EmbeddedDocument):
    """Description of an evaluation result."""

    eval_key = StringField()
    timestamp = DateTimeField()
    config = DictField()
    view_stages = ListField(StringField())
