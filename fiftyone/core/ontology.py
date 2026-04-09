"""
Ontology classes for defining reusable annotation structures.

| Copyright 2017-2026, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""

from __future__ import annotations

from datetime import datetime
from typing import Any, Optional

from fiftyone.core.annotation.attributes import (
    Attribute,
    When,
    WhenOperator,
)  # noqa: F401
from fiftyone.core.odm.ontology import OntologyType


class Ontology:
    """Abstract base class for ontology types.

    Ontologies are global, named, versioned resources that define reusable
    annotation structures. They are not scoped to any single dataset.

    Subclasses must set :attr:`_TYPE` to the corresponding
    :class:`fiftyone.core.odm.ontology.OntologyType` value.

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
        self.name = name
        self.description = description
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

        if self.description is not None:
            d["description"] = self.description

        if self.version is not None:
            d["version"] = self.version

        if self.created_at is not None:
            d["created_at"] = self.created_at

        if self.last_modified_at is not None:
            d["last_modified_at"] = self.last_modified_at

        return d

    def __repr__(self) -> str:
        return (
            f"{self.__class__.__name__}("
            f"name={self.name!r}, version={self.version})"
        )


class AnnotationOntology(Ontology):
    """A named, versioned annotation ontology.

    Bundles typed attributes (with optional conditional display logic) and
    taxonomy references into a single document that gets connected to a
    label schema on a field.

    Args:
        name: the ontology name
        description: optional description
        taxonomies: list of taxonomy names referenced by this ontology
        attributes: list of :class:`Attribute` instances

    Example::

        AnnotationOntology(
            name="vehicle_damage_ontology",
            description="Vehicle damage annotation",
            taxonomies=["vehicle_classes"],
            attributes=[
                Attribute(
                    name="damage_present",
                    type="bool",
                    component="checkbox",
                ),
                Attribute(
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
        attributes: Optional[list[Attribute]] = None,
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
    def from_dict(cls, d: dict) -> AnnotationOntology:
        """Creates an :class:`AnnotationOntology` from a dict.

        Args:
            d: an annotation ontology dict

        Returns:
            an :class:`AnnotationOntology`
        """
        root = d.get("root", {})
        return cls(
            name=d["name"],
            description=d.get("description"),
            taxonomies=root.get("taxonomies", []),
            attributes=[
                Attribute.from_dict(a) for a in root.get("attributes", [])
            ],
        )


class Node:
    """A node in a :class:`Taxonomy` hierarchy.

    .. note::

        Taxonomy support is not yet implemented. This class is a
        placeholder for phase 2.

    Raises:
        NotImplementedError: always
    """

    def __init__(self, *args: Any, **kwargs: Any):
        raise NotImplementedError(
            "Node is not yet implemented; taxonomy support is planned for "
            "phase 2"
        )


class Taxonomy(Ontology):
    """A named, versioned, hierarchical class taxonomy.

    .. note::

        Taxonomy support is not yet implemented. This class is a
        placeholder for phase 2.

    Raises:
        NotImplementedError: always
    """

    _TYPE = OntologyType.TAXONOMY.value

    def __init__(self, *args: Any, **kwargs: Any):
        raise NotImplementedError(
            "Taxonomy is not yet implemented; taxonomy support is planned "
            "for phase 2"
        )
