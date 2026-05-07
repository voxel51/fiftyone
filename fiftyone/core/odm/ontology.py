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


# Internal layout version of an ``OntologyDocument`` row. Bump this paired
# with a forward migration whenever the persisted structure (in particular
# ``root``) changes shape. ``version`` (user-facing content history) is
# orthogonal to this.
CURRENT_SCHEMA_VERSION = 1


class OntologyDocument(Document):
    """Backing document for ontologies.

    Ontologies are global resources not scoped to any single dataset.
    Multiple datasets can reference the same ontology by name. Each
    save creates a new versioned document; ``(slug, version)`` is unique,
    so names differing only in case or punctuation collide on save.

    ``schema_version`` records the internal layout version of the row at
    write time. Bump :data:`CURRENT_SCHEMA_VERSION` and add a migration when
    changing the persisted structure (especially ``root``).
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
    schema_version = IntField(required=True, default=1)
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
            self._reject_slug_change()
            new_doc = self._save_as_new_version(now, *args, **kwargs)
            # Re-point self at the newly written version so callers retain a
            # live reference to the latest row, matching the standard
            # ``doc.save()`` contract.
            self.id = new_doc.id
            self.reload()
            return self

        # version is internal bookkeeping; compute from the DB on first save
        # too, so a caller-supplied value can't bypass append-only invariants.
        # Symmetric with the slug recomputation above.
        self.version = self._next_version()

        if self.created_at is None:
            self.created_at = now

        self.last_modified_at = now
        self.schema_version = CURRENT_SCHEMA_VERSION

        return super().save(*args, **kwargs)

    # pylint disable: mongoengine's ``objects`` queryset manager is attached
    # dynamically and not introspectable by pylint.
    def _reject_slug_change(  # pylint: disable=no-member
        self,
    ) -> None:
        """Raises if the in-memory slug differs from the persisted slug.

        Slug is the lineage key for append-only versioning; renames must go
        through :func:`fiftyone.core.ontology.rename_ontology`, which updates
        all versions in bulk.
        """
        persisted = OntologyDocument.objects(id=self.id).only("slug").first()
        if persisted is not None and self.slug != persisted.slug:
            raise ValueError(
                "Cannot change ontology slug via save(); use "
                "rename_ontology() to rename across all versions"
            )

    # pylint disable: mongoengine's ``objects`` queryset manager is attached
    # dynamically and not introspectable by pylint.
    def _next_version(  # pylint: disable=no-member
        self,
    ) -> int:
        """Returns the next version number for this slug's lineage."""
        latest = (
            OntologyDocument.objects(slug=self.slug)
            .order_by("-version")
            .only("version")
            .first()
        )
        return (latest.version + 1) if latest else 1

    def _save_as_new_version(
        self, now: datetime, *args: Any, **kwargs: Any
    ) -> OntologyDocument:
        # Append-only versioning: create a new document instead of updating
        # the existing one.
        new_doc = self.copy_with_new_id()
        new_doc.version = self._next_version()
        new_doc.schema_version = CURRENT_SCHEMA_VERSION
        new_doc.created_at = now
        new_doc.last_modified_at = now
        return super(OntologyDocument, new_doc).save(*args, **kwargs)
