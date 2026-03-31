"""
Ontology classes for defining reusable annotation structures.

| Copyright 2017-2026, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""

from __future__ import annotations

from copy import deepcopy
from datetime import datetime
from typing import Any, Optional

from fiftyone.core.odm.ontology import OntologyType


class Attribute:
    """A single attribute within a :class:`ConditionalAttributes` ontology.

    Args:
        name: the attribute name
        type: optional attribute type (e.g. ``"str"``, ``"bool"``,
            ``"list<str>"``)
        component: optional UI component hint (e.g. ``"dropdown"``,
            ``"checkbox"``, ``"radio"``)
        values: optional list of allowed values
        when: optional condition dict controlling when this attribute is
            visible. Must have a single operator key (``"equals"`` or
            ``"in"``) whose value is a dict with ``"field"`` and ``"value"``
            keys
        children: optional list of :class:`Attribute` instances that appear
            conditionally based on this attribute's value
    """

    def __init__(
        self,
        name: str,
        type: Optional[str] = None,
        component: Optional[str] = None,
        values: Optional[list] = None,
        when: Optional[dict] = None,
        children: Optional[list[Attribute]] = None,
    ):
        self.name = name
        self.type = type
        self.component = component
        self.values = values
        self.when = when
        self.children = children or []

    def to_dict(self) -> dict:
        """Serializes this attribute to a dict.

        Returns:
            a dict
        """
        d = {"name": self.name}

        if self.type is not None:
            d["type"] = self.type

        if self.component is not None:
            d["component"] = self.component

        if self.values is not None:
            d["values"] = self.values

        if self.when is not None:
            d["when"] = deepcopy(self.when)

        if self.children:
            d["children"] = [c.to_dict() for c in self.children]

        return d

    @classmethod
    def from_dict(cls, d: dict) -> Attribute:
        """Creates an :class:`Attribute` from a dict.

        Args:
            d: an attribute dict

        Returns:
            an :class:`Attribute`
        """
        children = [cls.from_dict(c) for c in d.get("children", [])]
        return cls(
            name=d["name"],
            type=d.get("type"),
            component=d.get("component"),
            values=d.get("values"),
            when=d.get("when"),
            children=children,
        )

    def __repr__(self) -> str:
        return f"Attribute(name={self.name!r})"


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

    _TYPE = None

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

    def _get_root(self) -> Any:
        """Returns the serialized root data for storage.

        Subclasses must implement this.
        """
        raise NotImplementedError

    @classmethod
    def _from_root(cls, root: Any) -> Any:
        """Deserializes root data from storage.

        Subclasses must implement this.
        """
        raise NotImplementedError

    def to_dict(self) -> dict:
        """Serializes this ontology to a dict.

        Returns:
            a dict
        """
        d = {
            "name": self.name,
            "type": self._TYPE,
            "root": self._get_root(),
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


class ConditionalAttributes(Ontology):
    """A named, versioned set of typed attributes with conditional display
    logic.

    Each attribute can optionally specify a ``when`` condition that controls
    its visibility based on the value of another attribute, as well as
    ``children`` attributes that appear conditionally.

    Args:
        name: the ontology name
        root: a list of :class:`Attribute` instances
        description: optional description

    Example::

        conditional = ConditionalAttributes(
            name="vehicle_damage_attributes",
            description="Vehicle damage condition attributes",
            root=[
                Attribute(
                    name="damage_location",
                    type="str",
                    component="dropdown",
                    values=["front", "rear", "driver_side", "passenger_side"],
                    when={"equals": {"field": "damage_present", "value": True}},
                ),
                Attribute(
                    name="damage_severity",
                    type="str",
                    component="radio",
                    values=["minor", "moderate", "severe"],
                    when={"equals": {"field": "damage_present", "value": True}},
                ),
            ],
        )
    """

    _TYPE = OntologyType.CONDITIONAL_ATTRIBUTES.value

    def __init__(
        self,
        name: str,
        root: Optional[list[Attribute]] = None,
        description: Optional[str] = None,
    ):
        super().__init__(name=name, description=description)
        self.root = root or []

    def _get_root(self) -> list[dict]:
        return [attr.to_dict() for attr in self.root]

    @classmethod
    def _from_root(cls, root: list) -> list[Attribute]:
        return [Attribute.from_dict(d) for d in root]

    @classmethod
    def from_dict(cls, d: dict) -> ConditionalAttributes:
        """Creates a :class:`ConditionalAttributes` from a dict.

        Args:
            d: a conditional attributes dict

        Returns:
            a :class:`ConditionalAttributes`
        """
        root = cls._from_root(d.get("root", []))
        return cls(
            name=d["name"],
            root=root,
            description=d.get("description"),
        )
