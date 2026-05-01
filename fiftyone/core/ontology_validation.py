"""
Validation for :class:`fiftyone.core.ontology.AnnotationOntology`.

| Copyright 2017-2026, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""

from fiftyone.core.annotation import constants as _fac
from fiftyone.core.annotation.attributes import WhenOperator
from fiftyone.core.ontology import AnnotationOntology


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
    #
    # TODO: taxonomy-reference resolution is deferred until Phase 2 ships
    # `Taxonomy` documents; validate that each `ontology.taxonomies` name
    # resolves to a `Taxonomy` in the DB once the type exists.
    errors: list[str] = [
        *_validate_unique_attribute_names(ontology),
        *_validate_when_operators(ontology),
        *_validate_types(ontology),
        *_validate_components(ontology),
        *_validate_no_cycles(ontology),
        *_validate_then_keys(ontology),
    ]

    if errors:
        bullet_list = "\n".join(f"  - {e}" for e in errors)
        raise ValueError(
            f"Invalid AnnotationOntology {ontology.name!r}:\n{bullet_list}"
        )


def _validate_unique_attribute_names(
    ontology: AnnotationOntology,
) -> list[str]:
    seen: set[str] = set()
    duplicates: set[str] = set()
    for attr in ontology.attributes:
        if attr.name in seen:
            duplicates.add(attr.name)
        seen.add(attr.name)

    if duplicates:
        return [f"duplicate attribute name(s): {sorted(duplicates)}"]
    return []


def _validate_when_operators(ontology: AnnotationOntology) -> list[str]:
    """Safety net for ``When.operator`` — ``When.__post_init__`` rejects
    invalid operators at construction, so this only catches values
    mutated onto a constructed instance.
    """
    errors: list[str] = []
    for attr in ontology.attributes:
        if attr.when is None:
            continue
        for w in attr.when:
            try:
                WhenOperator(w.operator)
            except ValueError:
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
        for w in attr.when:
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
    """Reject cycles in the When graph (internal refs only)."""
    graph: dict[str, list[str]] = {
        attr.name: [w.field for w in (attr.when or [])]
        for attr in ontology.attributes
    }
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
