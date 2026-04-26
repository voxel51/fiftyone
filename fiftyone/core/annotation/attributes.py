"""
Annotation attribute primitives for label schemas and ontologies.

| Copyright 2017-2026, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""

from dataclasses import dataclass
from enum import Enum
from typing import Any, Optional, Union


def _attr_insert_to_dict(d: dict, name: str, obj: object) -> dict:
    """Inserts ``obj.<name>`` into ``d`` under key ``name`` if it is set
    (i.e. not ``None``).
    """
    value = getattr(obj, name, None)
    if value is not None:
        d[name] = value
    return d


def _require_keys(d: dict, keys: tuple, cls: type) -> None:
    """Raises ``ValueError`` if any of ``keys`` are missing from ``d``."""
    missing = [k for k in keys if k not in d]
    if missing:
        raise ValueError(
            f"{cls.__name__} dict missing required key(s): "
            f"{', '.join(missing)}"
        )


class WhenOperator(str, Enum):
    """Supported logical operators for :class:`When` conditions."""

    EQUALS = "equals"
    IN = "in"


@dataclass(repr=False)
class When:
    """A visibility/override condition for an :class:`AttributeSpec`.

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

    operator: Union[WhenOperator, str]
    field: str
    value: Any
    then: Optional[dict] = None

    def __post_init__(self) -> None:
        self.operator = WhenOperator(self.operator)
        if not self.field:
            raise ValueError("When.field is required")

    def to_dict(self) -> dict:
        """Serializes this condition to a dict.

        Returns:
            a dict
        """
        d: dict[str, Any] = {
            "operator": self.operator.value,
            "field": self.field,
            "value": self.value,
        }
        _attr_insert_to_dict(d, "then", self)
        return d

    @classmethod
    def from_dict(cls, d: dict) -> "When":
        """Creates a :class:`When` from a dict.

        Args:
            d: a condition dict

        Returns:
            a :class:`When`
        """
        _require_keys(d, ("operator", "field", "value"), cls)
        then = d.get("then")
        if then is not None and not isinstance(then, dict):
            raise ValueError("When.then must be a dict if provided")
        return cls(
            operator=d["operator"],
            field=d["field"],
            value=d["value"],
            then=then,
        )

    def __repr__(self) -> str:
        parts = (
            f"When({self.operator.value!r}, "
            f"field={self.field!r}, value={self.value!r}"
        )
        if self.then is not None:
            parts += f", then={self.then!r}"
        return parts + ")"


@dataclass(repr=False)
class AttributeSpec:
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
            this attribute is visible or field overrides

    Example::

        AttributeSpec(
            name="damage_location",
            type="str",
            component="dropdown",
            values=["front", "rear", "driver_side", "passenger_side"],
            when=[When(WhenOperator.EQUALS, field="damage_present", value=True)],
        )
    """

    name: str
    type: str
    component: str
    values: Optional[list] = None
    when: Optional[list[When]] = None

    def __post_init__(self) -> None:
        missing = [
            k for k in ("name", "type", "component") if not getattr(self, k)
        ]
        if missing:
            raise ValueError(
                f"AttributeSpec missing required field(s): "
                f"{', '.join(missing)}"
            )

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
        _attr_insert_to_dict(d, "values", self)
        if self.when is not None:
            d["when"] = [w.to_dict() for w in self.when]
        return d

    @classmethod
    def from_dict(cls, d: dict) -> "AttributeSpec":
        """Creates an :class:`AttributeSpec` from a dict.

        Args:
            d: an attribute dict

        Returns:
            an :class:`AttributeSpec`
        """
        _require_keys(d, ("name", "type", "component"), cls)

        values = d.get("values")
        if values is not None and not isinstance(values, list):
            raise ValueError("AttributeSpec.values must be a list if provided")

        when = None
        if "when" in d:
            if not isinstance(d["when"], list):
                raise ValueError(
                    "AttributeSpec.when must be a list if provided"
                )
            when = [When.from_dict(w) for w in d["when"]]

        return cls(
            name=d["name"],
            type=d["type"],
            component=d["component"],
            values=values,
            when=when,
        )

    def __repr__(self) -> str:
        return f"AttributeSpec(name={self.name!r}, type={self.type!r})"
