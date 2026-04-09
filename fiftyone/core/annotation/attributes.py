"""
Annotation attribute primitives for label schemas and ontologies.

| Copyright 2017-2026, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""

from __future__ import annotations

from enum import Enum
from typing import Any, Optional


class WhenOperator(str, Enum):
    """Supported logical operators for :class:`When` conditions."""

    EQUALS = "equals"
    IN = "in"


class When:
    """A visibility/override condition for an :class:`Attribute`.

    Controls when an attribute is shown based on the value of another
    attribute. Multiple ``When`` conditions on a single attribute are
    combined with implicit AND.

    Args:
        operator: the logical operator (:class:`WhenOperator` or its string
            value)
        field: the name of the attribute to evaluate
        value: the value (or values) to compare against
        then: optional dict of attribute overrides applied when this
            condition matches (e.g. ``{"values": ["a", "b"]}``)

    Example::

        When(WhenOperator.EQUALS, field="damage_present", value=True)
        When(WhenOperator.IN, field="car_model", value=["camry", "corolla"])
        When(
            WhenOperator.EQUALS,
            field="vehicle_type",
            value="car",
            then={"values": ["sedan", "suv", "coupe"]},
        )
    """

    def __init__(
        self,
        operator: WhenOperator | str,
        *,
        field: str,
        value: Any,
        then: Optional[dict] = None,
    ):
        self.operator = WhenOperator(operator)
        self.field = field
        self.value = value
        self.then = then

    def to_dict(self) -> dict:
        """Serializes this condition to a dict.

        Returns:
            a dict
        """
        d: dict[str, Any] = {
            self.operator.value: {"field": self.field, "value": self.value}
        }
        if self.then is not None:
            d["then"] = self.then
        return d

    @classmethod
    def from_dict(cls, d: dict) -> When:
        """Creates a :class:`When` from a dict.

        Args:
            d: a condition dict

        Returns:
            a :class:`When`
        """
        operator = next(k for k in d if k != "then")
        operand = d[operator]
        return cls(
            operator=operator,
            field=operand["field"],
            value=operand["value"],
            then=d.get("then"),
        )

    def __repr__(self) -> str:
        parts = (
            f"When({self.operator.value!r}, "
            f"field={self.field!r}, value={self.value!r}"
        )
        if self.then is not None:
            parts += f", then={self.then!r}"
        return parts + ")"


class Attribute:
    """A typed annotation attribute with optional conditional visibility.

    Used in label schemas and annotation ontologies to define annotation
    fields with display hints and conditional logic.

    Args:
        name: the attribute name
        type: the value type (e.g. ``"bool"``, ``"str"``)
        component: the UI component (e.g. ``"checkbox"``, ``"dropdown"``,
            ``"radio"``)
        values: optional list of allowed values
        when: optional list of :class:`When` conditions controlling when
            this attribute is visible (implicit AND)

    Example::

        Attribute(
            name="damage_location",
            type="str",
            component="dropdown",
            values=["front", "rear", "driver_side", "passenger_side"],
            when=[When(WhenOperator.EQUALS, field="damage_present", value=True)],
        )
    """

    def __init__(
        self,
        name: str,
        type: str,
        component: str,
        values: Optional[list] = None,
        when: Optional[list[When]] = None,
    ):
        if not name:
            raise ValueError("Attribute 'name' is required")
        if not type:
            raise ValueError("Attribute 'type' is required")
        if not component:
            raise ValueError("Attribute 'component' is required")

        self.name = name
        self.type = type
        self.component = component
        self.values = values
        self.when = when

    def to_dict(self) -> dict:
        """Serializes this attribute to a dict.

        Returns:
            a dict
        """
        d: dict[str, Any] = {
            "name": self.name,
            "type": self.type,
            "component": self.component,
        }
        if self.values is not None:
            d["values"] = self.values
        if self.when is not None:
            d["when"] = [w.to_dict() for w in self.when]
        return d

    @classmethod
    def from_dict(cls, d: dict) -> Attribute:
        """Creates an :class:`Attribute` from a dict.

        Args:
            d: an attribute dict

        Returns:
            an :class:`Attribute`
        """
        when = None
        if "when" in d:
            when = [When.from_dict(w) for w in d["when"]]

        return cls(
            name=d["name"],
            type=d["type"],
            component=d["component"],
            values=d.get("values"),
            when=when,
        )

    def __repr__(self) -> str:
        return f"Attribute(name={self.name!r}, type={self.type!r})"
