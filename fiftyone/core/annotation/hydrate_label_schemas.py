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


def hydrate_applied_ontology(label_schema: dict) -> dict:
    """Merges a referenced annotation ontology's attributes into a label
    schema.

    If ``label_schema`` has an ``applied_ontology`` key that resolves to an
    annotation ontology, returns a new dict with the ontology's attributes
    merged into the ``attributes`` list. Each merged attribute carries a
    ``_source: <ontology_name>`` marker. Attributes are matched by ``name``
    and ontology values win on collision.

    If the schema has no ``applied_ontology`` reference, or if the
    reference is dangling or points at a non-annotation ontology, the
    schema is returned unchanged. A dangling reference is logged at
    WARNING so operators can detect deleted-ontology scenarios.

    Args:
        label_schema: a label schema dict

    Returns:
        a hydrated copy of ``label_schema``, or ``label_schema`` unchanged
        when there is nothing to hydrate
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
            "returning label schema without hydration",
            ontology_name,
        )
        # do not cause app failure on mis-configuration
        return label_schema

    if not ontology.is_annotation_ontology:
        logger.warning(
            "applied_ontology '%s' does not resolve to an Annotation Ontology"
            " ontology; returning label schema without hydration",
            ontology_name,
        )
        # do not cause app failure on mis-configuration
        return label_schema

    return _merge(label_schema, ontology)


def _merge(label_schema: dict, ontology: Any) -> dict:
    hydrated = copy.deepcopy(label_schema)
    existing = hydrated.get(foac.ATTRIBUTES, [])

    # Preserve existing schema order; ontology-only attrs appended.
    by_name: dict = {a.get(foac.NAME): a for a in existing}
    ordered_names = [a.get(foac.NAME) for a in existing]

    for attr_spec in ontology.attributes:
        attr_dict = attr_spec.to_dict()
        attr_dict[_SOURCE] = ontology.name
        name = attr_dict.get(foac.NAME)
        if name not in by_name:
            ordered_names.append(name)
        # ontology wins on collision
        by_name[name] = attr_dict

    hydrated[foac.ATTRIBUTES] = [by_name[n] for n in ordered_names]
    return hydrated
