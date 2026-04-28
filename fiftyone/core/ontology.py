"""
Ontology classes for defining reusable annotation and taxonomy structures.

| Copyright 2017-2026, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""

import abc
from datetime import datetime
from typing import Any, Optional

from fiftyone.core.annotation.attributes import (
    AttributeSpec,
    attr_insert_to_dict,
)
from fiftyone.core.odm.ontology import OntologyType


class Ontology(abc.ABC):
    """Abstract base class for ontology types.

    Ontologies are global, named, versioned resources that define reusable
    annotation structures. They are not scoped to any single dataset.
    ``save()`` and ``load()`` populate :attr:`version`,
    :attr:`created_at`, and :attr:`last_modified_at`.

    Args:
        name: the ontology name
        description: optional description
    """

    _TYPE: Optional[str] = None

    def __init__(
        self,
        name: str,
        description: Optional[str] = None,
    ):
        if name is None:
            raise ValueError("Ontology name is required")
        self.name = name.strip()
        if not self.name:
            raise ValueError("Ontology name cannot be empty")
        self.description = description
        # Backing ``OntologyDocument`` once persisted; ``None`` until then.
        self._doc = None

    @property
    def version(self) -> Optional[int]:
        """The version of this ontology, or ``None`` if not yet saved."""
        if self._doc is not None:
            return self._doc.version

        return None

    @property
    def created_at(self) -> Optional[datetime]:
        """The datetime this ontology was created, or ``None`` if not yet
        saved.
        """
        if self._doc is not None:
            return self._doc.created_at

        return None

    @property
    def last_modified_at(self) -> Optional[datetime]:
        """The datetime this ontology was last modified, or ``None`` if not
        yet saved.
        """
        if self._doc is not None:
            return self._doc.last_modified_at

        return None

    def to_dict(self) -> dict:
        """Serializes this ontology to a dict.

        Returns:
            a dict
        """
        d: dict[str, Any] = {
            "name": self.name,
            "type": self._TYPE,
        }
        for attr in (
            "description",
            "version",
            "created_at",
            "last_modified_at",
        ):
            attr_insert_to_dict(d, attr, self)
        return d

    @classmethod
    @abc.abstractmethod
    def from_dict(cls, d: dict) -> "Ontology":
        """Creates an ontology from a dict.

        Args:
            d: an ontology dict

        Returns:
            an :class:`Ontology`
        """

    def __repr__(self) -> str:
        return (
            f"{self.__class__.__name__}("
            f"name={self.name!r}, version={self.version})"
        )


class AnnotationOntology(Ontology):
    """Ontology for defining annotation structures.

    Bundles typed attributes (with optional conditional display logic) and
    taxonomy references into a single document that gets connected to a
    label schema on a field.

    Args:
        name: the ontology name
        description: optional description
        taxonomies: list of taxonomy names referenced by this ontology
        attributes: list of :class:`AttributeSpec` instances

    Example::

        AnnotationOntology(
            name="vehicle_damage_ontology",
            description="Vehicle damage annotation",
            taxonomies=["vehicle_classes"],
            attributes=[
                AttributeSpec(
                    name="damage_present",
                    type="bool",
                    component="checkbox",
                ),
                AttributeSpec(
                    name="damage_location",
                    type="str",
                    component="dropdown",
                    values=["front", "rear", "driver_side", "passenger_side"],
                    when=[When(WhenOperator.EQUALS, field="damage_present", value=True)],
                ),
            ],
        )
    """

    _TYPE = OntologyType.ANNOTATION_ONTOLOGY.value

    def __init__(
        self,
        name: str,
        description: Optional[str] = None,
        taxonomies: Optional[list[str]] = None,
        attributes: Optional[list[AttributeSpec]] = None,
    ):
        super().__init__(name=name, description=description)
        self.taxonomies = taxonomies or []
        self.attributes = attributes or []

    def to_dict(self) -> dict:
        """Serializes this annotation ontology to a dict.

        Returns:
            a dict
        """
        d = super().to_dict()
        d["root"] = {
            "taxonomies": self.taxonomies,
            "attributes": [attr.to_dict() for attr in self.attributes],
        }
        return d

    @classmethod
    def from_dict(cls, d: dict) -> "AnnotationOntology":
        """Creates an :class:`AnnotationOntology` from a dict.

        Args:
            d: an annotation ontology dict

        Returns:
            an :class:`AnnotationOntology`
        """
        root = d.get("root") or {}
        return cls(
            name=d["name"],
            description=d.get("description"),
            taxonomies=root.get("taxonomies", []),
            attributes=[
                AttributeSpec.from_dict(a) for a in root.get("attributes", [])
            ],
        )
