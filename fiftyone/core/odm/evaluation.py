"""
Evaluation documents.

| Copyright 2017-2021, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""
from mongoengine import DictField, ListField, StringField

from .document import EmbeddedDocument


class EvaluationDocument(EmbeddedDocument):
    """Description of an evaluation result."""

    eval_key = StringField()
    pred_field = StringField()
    gt_field = StringField()
    config = DictField()
    view_stages = ListField(StringField())
