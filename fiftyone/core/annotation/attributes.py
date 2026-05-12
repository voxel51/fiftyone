"""
Annotation attribute primitives for label schemas and ontologies.

| Copyright 2017-2026, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""

import abc
from dataclasses import dataclass
from enum import Enum
from typing import Any, Generator, Literal, Optional, Union


#: Maximum nesting depth allowed for a ``when`` condition tree. Mirrors the
#: 20-level taxonomy depth limit cited in the PRD.
MAX_CONDITION_DEPTH = 20


def attr_insert_to_dict(d: dict, name: str, obj: object) -> dict:
    """Inserts ``obj.<name>`` into ``d`` under key ``name`` if it is set
    (i.e. not ``None``).
    """
    value = getattr(obj, name, None)
    if value is not None:
        d[name] = value
    return d


def _require_keys(d: dict, keys: tuple, cls: type) -> None:
    """Raises ``ValueError`` if ``d`` is not a dict or is missing any of
    ``keys``.
    """
    if not isinstance(d, dict):
        raise ValueError(
            f"{cls.__name__}.from_dict expects a dict, got "
            f"{type(d).__name__}"
        )
    missing = [k for k in keys if k not in d]
    if missing:
        raise ValueError(
            f"{cls.__name__} dict missing required key(s): "
            f"{', '.join(missing)}"
        )


class WhenOperator(str, Enum):
    """Supported logical operators for all :class:`WhenCondition` nodes."""

    EQUALS = "equals"
    IN = "in"
    AND = "and"
    OR = "or"


class WhenCondition(abc.ABC):
    """Abstract base class for all condition nodes in a ``when`` expression
    tree.

    A ``when`` expression is a tree of :class:`WhenCondition` nodes.
    Leaves are :class:`When` instances (or the convenience subclasses
    :class:`WhenEquals` / :class:`WhenIn`). Interior nodes are
    :class:`WhenAnd` and :class:`WhenOr`, which hold child conditions and
    evaluate them with AND / OR semantics respectively.

    Subclasses must implement :meth:`to_dict`. Deserialization always goes
    through :meth:`from_dict`, which dispatches on the ``"operator"`` key.
    """

    @abc.abstractmethod
    def to_dict(self) -> dict:
        """Serializes this condition to a plain dict.

        Returns:
            a dict
        """

    @classmethod
    def from_dict(cls, d: dict, _depth: int = 0) -> "WhenCondition":
        """Deserializes a condition from a plain dict.

        Dispatches to :class:`WhenAnd`, :class:`WhenOr`, or :class:`When`
        based on the ``"operator"`` key.

        Args:
            d: a condition dict

        Returns:
            a :class:`WhenCondition`
        """
        if _depth > MAX_CONDITION_DEPTH:
            raise ValueError(
                f"condition tree exceeds the maximum nesting depth of "
                f"{MAX_CONDITION_DEPTH}"
            )
        if not isinstance(d, dict):
            raise ValueError(
                f"WhenCondition.from_dict expects a dict, got "
                f"{type(d).__name__}"
            )
        op = d.get("operator")
        if op == WhenOperator.AND:
            return WhenAnd.from_dict(d, _depth=_depth + 1)
        if op == WhenOperator.OR:
            return WhenOr.from_dict(d, _depth=_depth + 1)
        return When.from_dict(d)


def collect_leaf_conditions(
    root: WhenCondition,
    _depth: int = 0,
) -> Generator["When", None, None]:
    """Recursively yields all leaf :class:`When` nodes in a condition tree.

    Group nodes (:class:`WhenAnd`, :class:`WhenOr`) are traversed but not
    yielded. Only :class:`When` leaves (including :class:`WhenEquals` and
    :class:`WhenIn`) are yielded.

    This is the correct way for validation code to inspect operators, field
    references, and ``then`` overrides without needing to know about nesting.

    Args:
        root: the root condition node to traverse

    Yields:
        each leaf :class:`When` node in the tree
    """
    if _depth > MAX_CONDITION_DEPTH:
        raise ValueError(
            f"condition tree exceeds the maximum nesting depth of "
            f"{MAX_CONDITION_DEPTH}"
        )
    if isinstance(root, (WhenAnd, WhenOr)):
        for child in root.conditions:
            yield from collect_leaf_conditions(child, _depth=_depth + 1)
    elif isinstance(root, When):
        yield root
    else:
        raise TypeError(
            f"collect_leaf_conditions encountered an unexpected node type: "
            f"{type(root).__name__!r}"
        )


@dataclass(repr=False)
class When(WhenCondition):
    """A leaf visibility/override condition for an :class:`AttributeSpec`.

    Controls when an attribute is shown based on the value of another
    attribute. Compose multiple conditions using :class:`WhenAnd` and
    :class:`WhenOr`.

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

    operator: Union[WhenOperator, Literal["equals", "in"]]
    field: str
    value: Any
    then: Optional[dict] = None

    def __post_init__(self) -> None:
        self.operator = WhenOperator(self.operator)
        if not isinstance(self.field, str) or not self.field:
            raise ValueError("When.field must be a non-empty string")
        if self.then is not None and not isinstance(self.then, dict):
            raise ValueError("When.then must be a dict if provided")

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
        attr_insert_to_dict(d, "then", self)
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
        return cls(
            operator=d["operator"],
            field=d["field"],
            value=d["value"],
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


class WhenEquals(When):
    """Convenience subclass of :class:`When` for ``equals`` conditions.

    Equivalent to ``When(WhenOperator.EQUALS, field=..., value=...)``
    without spelling the operator. Inherits ``to_dict``,
    ``__post_init__`` validation, and operator-based dispatch from
    :class:`When`.

    Example::

        WhenEquals(field="damage_present", value=True)
    """

    def __init__(self, field: str, value: Any, then: Optional[dict] = None):
        super().__init__(
            operator=WhenOperator.EQUALS,
            field=field,
            value=value,
            then=then,
        )

    def __repr__(self) -> str:
        parts = f"WhenEquals(field={self.field!r}, value={self.value!r}"
        if self.then is not None:
            parts += f", then={self.then!r}"
        return parts + ")"


class WhenIn(When):
    """Convenience subclass of :class:`When` for ``in`` conditions.

    Equivalent to ``When(WhenOperator.IN, field=..., value=[...])``
    without spelling the operator. Inherits ``to_dict``,
    ``__post_init__`` validation, and operator-based dispatch from
    :class:`When`.

    Example::

        WhenIn(field="car_model", value=["camry", "corolla"])
    """

    def __init__(self, field: str, value: list, then: Optional[dict] = None):
        super().__init__(
            operator=WhenOperator.IN,
            field=field,
            value=value,
            then=then,
        )

    def __repr__(self) -> str:
        parts = f"WhenIn(field={self.field!r}, value={self.value!r}"
        if self.then is not None:
            parts += f", then={self.then!r}"
        return parts + ")"


@dataclass(repr=False)
class WhenAnd(WhenCondition):
    """An AND group condition: satisfied when ALL child conditions are met.

    Child conditions may themselves be leaves (:class:`When`,
    :class:`WhenEquals`, :class:`WhenIn`) or nested groups
    (:class:`WhenAnd`, :class:`WhenOr`), enabling arbitrary boolean
    composition.

    Args:
        conditions: list of child :class:`WhenCondition` nodes, all of which
            must be satisfied

    Example::

        WhenAnd([
            WhenEquals(field="has_damage", value=True),
            WhenIn(field="vehicle_type", value=["car", "truck"]),
        ])

        # Nested composition
        WhenAnd([
            WhenEquals(field="has_damage", value=True),
            WhenOr([
                WhenEquals(field="vehicle_type", value="car"),
                WhenEquals(field="vehicle_type", value="truck"),
            ]),
        ])
    """

    conditions: list

    def __post_init__(self) -> None:
        if not isinstance(self.conditions, list) or not self.conditions:
            raise ValueError("WhenAnd.conditions must be a non-empty list")
        for i, c in enumerate(self.conditions):
            if not isinstance(c, WhenCondition):
                raise ValueError(
                    f"WhenAnd.conditions[{i}] must be a WhenCondition, "
                    f"got {type(c).__name__!r}"
                )

    def to_dict(self) -> dict:
        """Serializes this group condition to a dict.

        Returns:
            a dict
        """
        return {
            "operator": WhenOperator.AND.value,
            "conditions": [c.to_dict() for c in self.conditions],
        }

    @classmethod
    def from_dict(cls, d: dict, _depth: int = 0) -> "WhenAnd":
        """Creates a :class:`WhenAnd` from a dict.

        Args:
            d: a condition dict with ``"operator": "and"``

        Returns:
            a :class:`WhenAnd`
        """
        _require_keys(d, ("conditions",), cls)
        if not isinstance(d["conditions"], list):
            raise ValueError("WhenAnd.conditions must be a list")
        return cls(
            [
                WhenCondition.from_dict(c, _depth=_depth)
                for c in d["conditions"]
            ]
        )

    def __repr__(self) -> str:
        return f"WhenAnd({self.conditions!r})"


@dataclass(repr=False)
class WhenOr(WhenCondition):
    """An OR group condition: satisfied when ANY child condition is met.

    Child conditions may themselves be leaves (:class:`When`,
    :class:`WhenEquals`, :class:`WhenIn`) or nested groups
    (:class:`WhenAnd`, :class:`WhenOr`), enabling arbitrary boolean
    composition.

    Args:
        conditions: list of child :class:`WhenCondition` nodes, at least one
            of which must be satisfied

    Example::

        WhenOr([
            WhenEquals(field="vehicle_type", value="car"),
            WhenEquals(field="vehicle_type", value="truck"),
        ])

        # Nested: show when damage is present AND region is front OR rear
        WhenAnd([
            WhenEquals(field="damage_present", value=True),
            WhenOr([
                WhenEquals(field="region", value="front"),
                WhenEquals(field="region", value="rear"),
            ]),
        ])
    """

    conditions: list

    def __post_init__(self) -> None:
        if not isinstance(self.conditions, list) or not self.conditions:
            raise ValueError("WhenOr.conditions must be a non-empty list")
        for i, c in enumerate(self.conditions):
            if not isinstance(c, WhenCondition):
                raise ValueError(
                    f"WhenOr.conditions[{i}] must be a WhenCondition, "
                    f"got {type(c).__name__!r}"
                )

    def to_dict(self) -> dict:
        """Serializes this group condition to a dict.

        Returns:
            a dict
        """
        return {
            "operator": WhenOperator.OR.value,
            "conditions": [c.to_dict() for c in self.conditions],
        }

    @classmethod
    def from_dict(cls, d: dict, _depth: int = 0) -> "WhenOr":
        """Creates a :class:`WhenOr` from a dict.

        Args:
            d: a condition dict with ``"operator": "or"``

        Returns:
            a :class:`WhenOr`
        """
        _require_keys(d, ("conditions",), cls)
        if not isinstance(d["conditions"], list):
            raise ValueError("WhenOr.conditions must be a list")
        return cls(
            [
                WhenCondition.from_dict(c, _depth=_depth)
                for c in d["conditions"]
            ]
        )

    def __repr__(self) -> str:
        return f"WhenOr({self.conditions!r})"


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
        when: optional :class:`WhenCondition` controlling when this attribute
            is visible. Use a bare leaf for a single condition, or compose
            with :class:`WhenAnd` / :class:`WhenOr` for boolean logic.
        read_only: optional flag marking the attribute as non-editable
        default: optional default value (type matches ``type``)
        range: optional ``[min, max]`` for numeric-with-slider components
        precision: optional decimal places for float-with-text components

    Example::

        # Single condition
        AttributeSpec(
            name="damage_location",
            type="str",
            component="dropdown",
            values=["front", "rear", "driver_side", "passenger_side"],
            when=WhenEquals(field="damage_present", value=True),
        )

        # AND of two conditions
        AttributeSpec(
            name="repair_priority",
            type="str",
            component="radio",
            values=["urgent", "scheduled", "deferred"],
            when=WhenAnd([
                WhenEquals(field="damage_present", value=True),
                WhenIn(field="vehicle_type", value=["car", "truck"]),
            ]),
        )

        # Nested AND / OR
        AttributeSpec(
            name="repair_detail",
            type="str",
            component="text",
            when=WhenAnd([
                WhenEquals(field="damage_present", value=True),
                WhenOr([
                    WhenEquals(field="region", value="front"),
                    WhenEquals(field="region", value="rear"),
                ]),
            ]),
        )
    """

    name: str
    type: str
    component: str
    values: Optional[list] = None
    when: Optional[WhenCondition] = None
    read_only: Optional[bool] = None
    default: Any = None
    range: Optional[list] = None
    precision: Optional[int] = None

    def __post_init__(self) -> None:
        invalid_fields = [
            k
            for k in ("name", "type", "component")
            if not isinstance(getattr(self, k), str) or not getattr(self, k)
        ]
        if invalid_fields:
            raise ValueError(
                f"AttributeSpec field(s) must be non-empty strings: "
                f"{', '.join(invalid_fields)}"
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
        attr_insert_to_dict(d, "values", self)
        attr_insert_to_dict(d, "read_only", self)
        attr_insert_to_dict(d, "default", self)
        attr_insert_to_dict(d, "range", self)
        attr_insert_to_dict(d, "precision", self)
        if self.when is not None:
            d["when"] = self.when.to_dict()
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
            when = WhenCondition.from_dict(d["when"])

        return cls(
            name=d["name"],
            type=d["type"],
            component=d["component"],
            values=values,
            when=when,
            read_only=d.get("read_only"),
            default=d.get("default"),
            range=d.get("range"),
            precision=d.get("precision"),
        )

    def __repr__(self) -> str:
        return f"AttributeSpec(name={self.name!r}, type={self.type!r})"
