"""
Dataset run documents.

| Copyright 2017-2021, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""
from mongoengine import (
    DictField,
    ListField,
    ReferenceField,
    StringField,
    DateTimeField,
)

from .document import DynamicDocument, EmbeddedDocument


class RunResultsDocument(DynamicDocument):
    """Results of a run on a dataset."""

    meta = {"collection": "run_results"}

    def __repr__(self):
        return "<%s>" % self.__class__.__name__


class RunDocument(EmbeddedDocument):
    """Description of a run on a dataset."""

    key = StringField()
    timestamp = DateTimeField()
    config = DictField()
    view_stages = ListField(StringField())
    results = ReferenceField(RunResultsDocument)
