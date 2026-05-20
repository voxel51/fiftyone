"""
Annotation label schema hydration

Resolves ``applied_ontology`` references in label schemas by merging the
referenced annotation ontology's attributes into the schema's ``attributes``
list, tagging merged attributes with a ``_source`` marker.

| Copyright 2017-2026, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""

import copy
import logging
from typing import Any

import fiftyone.core.annotation.constants as foac


logger = logging.getLogger(__name__)

_SOURCE = "_source"


def attributes_with_source(ontology: Any) -> list[dict[str, Any]]:
    """Returns ontology attributes as dicts tagged with a ``_source`` marker.

    Args:
        ontology: an ontology object whose ``.attributes`` are attribute specs
            with a ``.to_dict()`` method and whose ``.name`` identifies the
            ontology

    Returns:
        a list of attribute dicts, each carrying ``_source: ontology.name``
    """
    return [
        {**attr_spec.to_dict(), _SOURCE: ontology.name}
        for attr_spec in ontology.attributes
    ]


def hydrate_applied_ontology(label_schema: dict) -> dict:
    """Merges a referenced annotation ontology's attributes into a label
    schema.

    If ``label_schema`` has an ``applied_ontology`` key that resolves to an
    annotation ontology, returns a new dict with the ontology's attributes
    merged into the ``attributes`` list. Each merged attribute carries a
    ``_source: <ontology_name>`` marker. Attributes are matched by ``name``
    and ontology values win on collision. When the ontology has a bundled
    taxonomy, an ``applied_taxonomy`` key is also surfaced on the response;
    it is never persisted on the schema itself.

    If the schema has no ``applied_ontology`` reference, the schema is
    returned unchanged. If the reference is dangling (deleted ontology)
    or points at a non-annotation ontology, the ``applied_ontology`` key
    is stripped from the returned schema and a WARNING is logged. This
    lets a subsequent save silently persist a clean schema rather than
    failing validation on the dangling reference.

    Args:
        label_schema: a label schema dict

    Returns:
        a hydrated copy of ``label_schema``, a copy with
        ``applied_ontology`` stripped if the reference is dangling, or
        the schema unchanged when there is nothing to do
    """
    ontology_name = label_schema.get(foac.APPLIED_ONTOLOGY)
    if ontology_name is None:
        return label_schema

    # Late import to avoid a circular import with the ontology SDK.
    from fiftyone.core.ontology import load_ontology

    try:
        ontology = load_ontology(ontology_name)
    except ValueError:
        logger.warning(
            "applied_ontology '%s' does not resolve to a known ontology; "
            "stripping the dangling reference from the returned schema",
            ontology_name,
        )
        return _strip_applied_ontology(label_schema)

    if not ontology.is_annotation_ontology:
        logger.warning(
            "applied_ontology '%s' does not resolve to an Annotation "
            "Ontology; stripping the reference from the returned schema",
            ontology_name,
        )
        return _strip_applied_ontology(label_schema)

    hydrated = _merge(label_schema, ontology)
    if ontology.taxonomy is not None:
        hydrated[foac.APPLIED_TAXONOMY] = ontology.taxonomy
    return hydrated


def _strip_applied_ontology(label_schema: dict) -> dict:
    cleaned = dict(label_schema)
    cleaned.pop(foac.APPLIED_ONTOLOGY, None)
    return cleaned


def dehydrate_applied_ontology(label_schema: dict) -> dict:
    """Strips hydration artifacts from a label schema before it is saved.

    Companion to :func:`hydrate_applied_ontology`. When the schema has an
    ``applied_ontology`` that resolves to an annotation ontology, drops
    any attribute whose ``name`` matches an ontology-owned attribute,
    strips the ``_source`` marker from the remaining attributes, and
    drops the ``applied_taxonomy`` key (surfaced at hydrate time, never
    persisted).

    Otherwise (no reference, dangling reference, or non-annotation
    reference) the schema is returned unchanged — the validator will
    surface the reference-level problem.

    Args:
        label_schema: a label schema dict, possibly carrying hydration
            artifacts from :func:`hydrate_applied_ontology`

    Returns:
        a deep-copied schema with hydration artifacts removed, or
        ``label_schema`` unchanged when there is nothing to dehydrate
    """
    ontology_name = label_schema.get(foac.APPLIED_ONTOLOGY)
    if ontology_name is None:
        return label_schema

    # Late import to avoid a circular import with the ontology SDK.
    from fiftyone.core.ontology import load_ontology

    try:
        ontology = load_ontology(ontology_name)
    except ValueError:
        return label_schema

    if not ontology.is_annotation_ontology:
        return label_schema

    ontology_owned_names = {a.name for a in ontology.attributes}

    cleaned = copy.deepcopy(label_schema)
    cleaned.pop(foac.APPLIED_TAXONOMY, None)
    kept = []
    for attr in cleaned.get(foac.ATTRIBUTES, []):
        # ontology-owned attrs get dropped entirely, so their _source goes
        # with them; only the kept (local) attrs need _source popped
        if attr.get(foac.NAME) in ontology_owned_names:
            continue
        attr.pop(_SOURCE, None)
        kept.append(attr)

    cleaned[foac.ATTRIBUTES] = kept
    return cleaned


def inline_applied_ontology(label_schema: dict, ontology: Any) -> dict:
    """Permanently inlines an annotation ontology's attributes into a
    label schema as local copies and removes the ``applied_ontology``
    reference.

    Used when the referenced ontology is about to be deleted (or for
    any other "freeze the current ontology state into the schema"
    operation). Unlike :func:`hydrate_applied_ontology`, the merged
    attributes are NOT marked with ``_source`` — they are now
    first-class local attributes — and the ``applied_ontology`` key
    is stripped from the result.

    The caller is responsible for resolving the ontology; this
    function does not load anything.

    Args:
        label_schema: a label schema dict
        ontology: an :class:`AnnotationOntology` whose attributes
            should be inlined

    Returns:
        a deep-copied schema with the ontology's attributes merged in
        as locals and the ``applied_ontology`` reference removed
    """
    merged = _merge(label_schema, ontology)
    for attr in merged.get(foac.ATTRIBUTES, []):
        attr.pop(_SOURCE, None)
    merged.pop(foac.APPLIED_ONTOLOGY, None)
    return merged


def _merge(label_schema: dict, ontology: Any) -> dict:
    hydrated = copy.deepcopy(label_schema)
    existing = hydrated.get(foac.ATTRIBUTES, [])

    # Preserve existing schema order; ontology-only attrs appended.
    by_name: dict = {a.get(foac.NAME): a for a in existing}
    ordered_names = [a.get(foac.NAME) for a in existing]

    for attr_dict in attributes_with_source(ontology):
        name = attr_dict.get(foac.NAME)
        if name not in by_name:
            ordered_names.append(name)
        # ontology wins on collision
        by_name[name] = attr_dict

    hydrated[foac.ATTRIBUTES] = [by_name[n] for n in ordered_names]
    return hydrated
