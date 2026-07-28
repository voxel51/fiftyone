"""
Validation for :mod:`fiftyone.core.ontology` SDK classes.

| Copyright 2017-2026, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""

from fiftyone.core.annotation import constants as _fac
from fiftyone.core.annotation.attributes import (
    WhenOperator,
    collect_leaf_conditions,
)
from fiftyone.core.annotation.nodes import Node
from fiftyone.core.ontology import AnnotationOntology, Taxonomy


_ALLOWED_THEN_KEYS = {"values", "component"}


def validate_annotation_ontology(ontology: AnnotationOntology) -> None:
    """Validates an :class:`AnnotationOntology`.

    Aggregates all ontology-level failures into a single error.
    :class:`When` operators are validated on construction.

    Args:
        ontology: the ontology to validate

    Raises:
        ValueError: if any rule fails
    """
    # TODO: `When.field` resolution is deferred — `field` may reference
    # an attribute in another label-schema layer, so it needs the full
    # label-schema context. Enforce at resolution time or in the frontend.
    errors: list[str] = [
        *_validate_when_operators(ontology),
        *_validate_types(ontology),
        *_validate_components(ontology),
        *_validate_no_cycles(ontology),
        *_validate_then_keys(ontology),
        *_validate_taxonomy_ref(ontology),
    ]

    if errors:
        bullet_list = "\n".join(f"  - {e}" for e in errors)
        raise ValueError(
            f"Invalid AnnotationOntology {ontology.name!r}:\n{bullet_list}"
        )


def validate_taxonomy(taxonomy: Taxonomy) -> None:
    """Validates a :class:`Taxonomy`.

    Aggregates all taxonomy-level failures into a single error.

    Args:
        taxonomy: the taxonomy to validate

    Raises:
        ValueError: if any rule fails
    """
    errors: list[str] = [
        *_validate_no_node_cycles(taxonomy),
        *_validate_unique_node_names(taxonomy),
    ]

    if errors:
        bullet_list = "\n".join(f"  - {e}" for e in errors)
        raise ValueError(f"Invalid Taxonomy {taxonomy.name!r}:\n{bullet_list}")


def _validate_when_operators(ontology: AnnotationOntology) -> list[str]:
    """Safety net for ``When.operator`` — ``When.__post_init__`` rejects
    invalid operators at construction, so this only catches values
    mutated onto a constructed instance.
    """
    errors: list[str] = []
    for attr in ontology.attributes:
        if attr.when is None:
            continue
        for w in collect_leaf_conditions(attr.when):
            try:
                WhenOperator(w.operator)
            except (ValueError, TypeError):
                # ``WhenOperator(unhashable)`` (e.g. a list) raises
                # ``TypeError`` from the enum's value lookup; treat it
                # the same as any other invalid operator value.
                errors.append(
                    f"attribute {attr.name!r}: invalid When.operator "
                    f"{w.operator!r}"
                )
    return errors


def _validate_types(ontology: AnnotationOntology) -> list[str]:
    """Check each ``AttributeSpec.type`` against the label-schema type
    registry (``constants.TYPE_TO_FIELD``).
    """
    errors: list[str] = []
    for attr in ontology.attributes:
        if attr.type not in _fac.TYPE_TO_FIELD:
            errors.append(
                f"attribute {attr.name!r}: unsupported type {attr.type!r}"
            )
    return errors


def _validate_components(ontology: AnnotationOntology) -> list[str]:
    """Check each ``AttributeSpec.component`` is valid for its declared
    type (per ``constants.TYPE_TO_COMPONENTS``).

    Attributes with an unsupported type are skipped — ``_validate_types``
    reports those separately so we avoid double-flagging.
    """
    errors: list[str] = []
    for attr in ontology.attributes:
        valid = _fac.TYPE_TO_COMPONENTS.get(attr.type)
        if valid is None:
            continue
        if attr.component not in valid:
            errors.append(
                f"attribute {attr.name!r}: component {attr.component!r} "
                f"not valid for type {attr.type!r}"
            )
    return errors


def _validate_then_keys(ontology: AnnotationOntology) -> list[str]:
    """Reject ``When.then`` overrides containing keys outside the
    allowed set (currently ``values`` and ``component``).
    """
    errors: list[str] = []
    for attr in ontology.attributes:
        if attr.when is None:
            continue
        for w in collect_leaf_conditions(attr.when):
            if w.then is None:
                continue
            # set difference: keys present in w.then but not in the
            # allow-list are disallowed.
            disallowed_keys = set(w.then) - _ALLOWED_THEN_KEYS
            if disallowed_keys:
                errors.append(
                    f"attribute {attr.name!r}: When.then has disallowed "
                    f"key(s) {sorted(disallowed_keys)}"
                )
    return errors


def _validate_no_cycles(ontology: AnnotationOntology) -> list[str]:
    """Reject cycles in the When graph (internal refs only).

    Same-name attributes (multi-variant pattern) accumulate their
    ``When.field`` edges under a single key — using a dict comprehension
    here would let later variants overwrite earlier ones and silently
    drop their edges from the cycle graph.
    """
    graph: dict[str, list[str]] = {}
    for attr in ontology.attributes:
        edges = (
            [w.field for w in collect_leaf_conditions(attr.when)]
            if attr.when is not None
            else []
        )
        graph.setdefault(attr.name, []).extend(edges)
    errors: list[str] = []
    for start in graph:
        to_visit = list(graph[start])
        seen: set[str] = set()
        while to_visit:
            node = to_visit.pop()
            if node == start:
                errors.append(f"cycle involving attribute {start!r}")
                break
            if node in seen or node not in graph:
                continue
            seen.add(node)
            to_visit.extend(graph[node])
    return errors


def _validate_taxonomy_ref(ontology: AnnotationOntology) -> list[str]:
    """Confirms ``ontology.taxonomy`` (if set) resolves to a saved
    :class:`Taxonomy`.
    """
    # Late import to dodge a circular import via the SDK entry points.
    from fiftyone.core.ontology import load_ontology

    errors: list[str] = []
    if ontology.taxonomy is None:
        return errors

    try:
        ref = load_ontology(ontology.taxonomy)
    except ValueError:
        errors.append(
            f"taxonomy reference {ontology.taxonomy!r} does not resolve "
            f"to a saved ontology"
        )
        return errors

    if not ref.is_taxonomy:
        errors.append(
            f"taxonomy reference {ontology.taxonomy!r} resolves to a "
            f"non-taxonomy ontology"
        )

    return errors


def _validate_no_node_cycles(taxonomy: Taxonomy) -> list[str]:
    """Detects cycles in the node tree.

    Pathological — Node trees built via ``from_dict`` or normal Python
    construction can't cycle, but a caller mutating ``values`` after
    construction could create one. Catch it before downstream code
    (serialization, traversal) recurses forever.
    """
    path_ids: set[int] = set()
    cycles: list[str] = []

    def visit(node: Node) -> None:
        if id(node) in path_ids:
            cycles.append(f"cycle detected at node {node.name!r}")
            return
        path_ids.add(id(node))
        for child in node.values or []:
            visit(child)
        path_ids.remove(id(node))

    visit(taxonomy.root)
    return cycles


def _validate_unique_node_names(taxonomy: Taxonomy) -> list[str]:
    """Per the proposal, node names are unique within the taxonomy.

    Uses an id-based visited set so a cyclic tree (which
    ``_validate_no_node_cycles`` reports separately) doesn't loop forever
    here.
    """
    seen_names: set[str] = set()
    duplicates: set[str] = set()
    visited_ids: set[int] = set()

    def visit(node: Node) -> None:
        if id(node) in visited_ids:
            return
        visited_ids.add(id(node))
        if node.name in seen_names:
            duplicates.add(node.name)
        seen_names.add(node.name)
        for child in node.values or []:
            visit(child)

    visit(taxonomy.root)
    if duplicates:
        return [f"duplicate node name(s): {sorted(duplicates)}"]
    return []
