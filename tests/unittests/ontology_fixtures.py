"""
Shared ontology fixtures for unit tests.

| Copyright 2017-2026, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""

from fiftyone.core.annotation.nodes import Node
from fiftyone.core.ontology import Taxonomy


def make_taxonomy(name: str = "test_taxonomy") -> Taxonomy:
    """Returns a small unsaved :class:`Taxonomy` suitable for round-trip
    and reference tests.

    Tree shape: ``vehicles → {car, truck → {pickup}}``.
    """
    return Taxonomy(
        name=name,
        description="Test taxonomy",
        root=Node(
            name="vehicles",
            can_select=False,
            values=[
                Node(name="car"),
                Node(name="truck", values=[Node(name="pickup")]),
            ],
        ),
    )
