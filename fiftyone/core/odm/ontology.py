"""
Ontology documents.

| Copyright 2017-2026, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""

from enum import Enum

from mongoengine.fields import DynamicField

from fiftyone.core.fields import (
    DateTimeField,
    IntField,
    StringField,
)

from .document import Document


class OntologyType(str, Enum):  # TODO - update to StrEnum
    """Allowed values for :attr:`OntologyDocument.type` in storage and APIs."""

    TAXONOMY = "taxonomy"
    CONDITIONAL_ATTRIBUTES = "conditional_attributes"


_ONTOLOGY_TYPE_VALUES = tuple(t.value for t in OntologyType)


class OntologyDocument(Document):
    """Backing document for ontologies.

    Ontologies are global resources not scoped to any single dataset.
    Multiple datasets can reference the same ontology by name. Each
    save creates a new versioned document; ``(name, version)`` is unique.
    """

    meta = {
        "collection": "ontologies",
        "strict": False,
        "indexes": [
            {
                "fields": ["name", "version"],
                "unique": True,
            },
            "type",
        ],
    }

    name = StringField(required=True)
    version = IntField(required=True, default=1)
    type = StringField(required=True, choices=_ONTOLOGY_TYPE_VALUES)
    description = StringField(default=None)
    root = DynamicField()
    created_at = DateTimeField()
    last_modified_at = DateTimeField()
