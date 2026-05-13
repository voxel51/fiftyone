"""
Taxonomy node primitive.

| Copyright 2017-2026, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""

from dataclasses import dataclass, field
from typing import Any, Optional

from fiftyone.core.annotation.attributes import (
    _require_keys,
    attr_insert_to_dict,
)


@dataclass(repr=False)
class Node:
    """A node in a :class:`fiftyone.core.ontology.Taxonomy` tree.

    There is a single node type: every node has the same shape regardless
    of whether it represents a leaf class, a sub-class, or a group header.
    The role of a node is determined by its position in the tree and by
    the ``can_select`` flag.

    Args:
        name: required label for this node — a class name, sub-class
            name, or group header. Must be unique within the taxonomy
            (uniqueness is enforced by ``validate_taxonomy``, not at
            construction time).
        description: optional context for the user (tooltip / guidance
            text in the UI)
        can_select: if ``False``, the node is a group header — it
            expands to show child nodes but is not itself selectable as
            a class. Defaults to ``True``.
        deprecated: if ``True``, the node is hidden from the UI for new
            selections but remains valid on existing labels. Defaults to
            ``False``.
        values: optional list of child :class:`Node` instances. A leaf
            node has no ``values``; a node with children has ``values``.

    Example::

        Node(
            name="vehicles",
            can_select=False,
            values=[
                Node(name="car"),
                Node(name="truck"),
            ],
        )
    """

    name: str
    description: Optional[str] = None
    can_select: bool = True
    deprecated: bool = False
    values: Optional[list["Node"]] = None

    def __post_init__(self) -> None:
        if not isinstance(self.name, str) or not self.name:
            raise ValueError("Node.name must be a non-empty string")
        if self.description is not None and not isinstance(
            self.description, str
        ):
            raise ValueError("Node.description must be a string if provided")
        if not isinstance(self.can_select, bool):
            raise ValueError("Node.can_select must be a bool")
        if not isinstance(self.deprecated, bool):
            raise ValueError("Node.deprecated must be a bool")
        if self.values is not None:
            if not isinstance(self.values, list):
                raise ValueError("Node.values must be a list if provided")
            if not all(isinstance(v, Node) for v in self.values):
                raise ValueError(
                    "Node.values must be a list of Node instances"
                )

    def to_dict(self) -> dict:
        """Serializes this node to a dict.

        Returns:
            a dict
        """
        d: dict[str, Any] = {"name": self.name}
        attr_insert_to_dict(d, "description", self)
        # omit default-valued fields to keep serialized trees compact at scale
        if self.can_select is not True:
            d["can_select"] = self.can_select
        if self.deprecated is not False:
            d["deprecated"] = self.deprecated
        if self.values is not None:
            d["values"] = [v.to_dict() for v in self.values]
        return d

    @classmethod
    def from_dict(cls, d: dict) -> "Node":
        """Creates a :class:`Node` from a dict.

        Args:
            d: a node dict

        Returns:
            a :class:`Node`
        """
        _require_keys(d, ("name",), cls)
        values_raw = d.get("values")
        values = (
            [cls.from_dict(v) for v in values_raw]
            if values_raw is not None
            else None
        )
        return cls(
            name=d["name"],
            description=d.get("description"),
            can_select=d.get("can_select", True),
            deprecated=d.get("deprecated", False),
            values=values,
        )

    def __repr__(self) -> str:
        n = len(self.values) if self.values is not None else 0
        return f"Node(name={self.name!r}, values={n})"
