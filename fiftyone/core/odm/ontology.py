"""
Ontology documents.

| Copyright 2017-2026, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""

from enum import Enum
from datetime import datetime, timezone

from fiftyone.core.fields import (
    DateTimeField,
    DictField,
    IntField,
    StringField,
)

from .document import Document


class OntologyType(str, Enum):  # TODO - update to StrEnum
    """Allowed values for :attr:`OntologyDocument.type` in storage and APIs.

    ``TAXONOMY`` — a reusable hierarchical class tree. Multiple annotation
    ontologies can reference the same taxonomy by name.

    ``ANNOTATION_ONTOLOGY`` — a container that defines classes, attributes
    (with optional conditional display logic), and references to taxonomies.
    This is the document that gets connected to a label schema on a field.
    """

    TAXONOMY = "taxonomy"
    ANNOTATION_ONTOLOGY = "annotation_ontology"


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
    root = DictField()
    created_at = DateTimeField()
    last_modified_at = DateTimeField()

    def save(self, *args, **kwargs):
        if not self.in_db and self.created_at is None:
            self.created_at = datetime.now(timezone.utc)

        return super().save(*args, **kwargs)
