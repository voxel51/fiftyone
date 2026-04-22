"""
Ontology documents.

| Copyright 2017-2026, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""

from __future__ import annotations

from enum import Enum
from datetime import datetime, timezone
from typing import Any

import fiftyone.core.utils as fou
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
    save creates a new versioned document; ``(slug, version)`` is unique,
    so names differing only in case or punctuation collide on save.
    """

    meta = {
        "collection": "ontologies",
        "strict": False,
        "indexes": [
            {
                "fields": ["slug", "version"],
                "unique": True,
            },
            "name",
            "type",
        ],
    }

    name = StringField(required=True)
    slug = StringField(required=True)
    version = IntField(required=True, default=1)
    type = StringField(required=True, choices=_ONTOLOGY_TYPE_VALUES)
    description = StringField(default=None)
    root = DictField()
    created_at = DateTimeField()
    last_modified_at = DateTimeField()

    def save(self, *args: Any, **kwargs: Any) -> OntologyDocument:
        now = datetime.now(timezone.utc)

        if self.name is not None:
            self.slug = fou.to_slug(self.name)

        # If this document already exists in MongoDB, don't update it in-place;
        # create and save a new (slug, version) document instead.
        if self.in_db:
            return self._save_as_new_version(now, *args, **kwargs)

        if self.created_at is None:
            self.created_at = now

        self.last_modified_at = now

        return super().save(*args, **kwargs)

    def _save_as_new_version(  # pylint: disable=no-member
        self, now: datetime, *args: Any, **kwargs: Any
    ) -> OntologyDocument:
        # Append-only versioning: create a new document instead of updating the
        # existing one.
        latest = (
            OntologyDocument.objects(slug=self.slug)
            .order_by("-version")
            .only("version")
            .first()
        )
        next_version = (latest.version + 1) if latest else 1

        new_doc = self.copy_with_new_id()
        new_doc.version = next_version
        new_doc.created_at = now
        new_doc.last_modified_at = now
        return super(OntologyDocument, new_doc).save(*args, **kwargs)
