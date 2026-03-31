"""
Ontology classes for defining reusable annotation structures.

| Copyright 2017-2026, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""

from __future__ import annotations

from datetime import datetime
from enum import Enum
from typing import Any, Optional

from fiftyone.core.odm.ontology import OntologyType


class WhenOperator(str, Enum):
    """Supported operators for :class:`WhenCondition`."""

    EQUALS = "equals"
    IN = "in"


class WhenCondition:
    """A visibility condition for an :class:`Attribute`.

    Controls when an attribute is shown based on the value of another
    attribute.

    Args:
        operator: the comparison operator
        field: the name of the field to evaluate
        value: the value (or values) to compare against
    """

    def __init__(
        self,
        operator: WhenOperator,
        field: str,
        value: Any,
    ):
        self.operator = WhenOperator(operator)
        self.field = field
        self.value = value

    def to_dict(self) -> dict:
        """Serializes this condition to a dict.

        Returns:
            a dict
        """
        return {
            self.operator.value: {"field": self.field, "value": self.value}
        }

    @classmethod
    def from_dict(cls, d: dict) -> WhenCondition:
        """Creates a :class:`WhenCondition` from a dict.

        Args:
            d: a condition dict

        Returns:
            a :class:`WhenCondition`
        """
        operator = next(iter(d))
        operand = d[operator]
        return cls(
            operator=operator,
            field=operand["field"],
            value=operand["value"],
        )

    def __repr__(self) -> str:
        return (
            f"WhenCondition(operator={self.operator.value!r}, "
            f"field={self.field!r}, value={self.value!r})"
        )


class Attribute:
    """A single attribute within a :class:`ConditionalAttributes` ontology.

    Attributes define conditional visibility rules only. Display concerns
    (type, component, allowed values) belong on the label schema that
    references this ontology, not here.

    Args:
        name: the attribute name
        when: :class:`WhenCondition` controlling when this attribute is visible
    """

    def __init__(
        self,
        name: str,
        when: WhenCondition,
    ):
        self.name = name
        self.when = when

    def to_dict(self) -> dict:
        """Serializes this attribute to a dict.

        Returns:
            a dict
        """
        return {
            "name": self.name,
            "when": self.when.to_dict(),
        }

    @classmethod
    def from_dict(cls, d: dict) -> Attribute:
        """Creates an :class:`Attribute` from a dict.

        Args:
            d: an attribute dict

        Returns:
            an :class:`Attribute`
        """
        return cls(
            name=d["name"],
            when=WhenCondition.from_dict(d["when"]),
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
    """A named, versioned set of attributes with conditional display logic.

    Each attribute can optionally specify a ``when`` condition that controls
    its visibility based on the value of another attribute. Display concerns
    (type, component, allowed values) belong on the label schema that
    references this ontology.

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
                    when=WhenCondition("equals", "damage_present", True),
                ),
                Attribute(
                    name="damage_severity",
                    when=WhenCondition("equals", "damage_present", True),
                ),
                Attribute(
                    name="airbags_deployed",
                    when=WhenCondition("equals", "damage_location", "front"),
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
