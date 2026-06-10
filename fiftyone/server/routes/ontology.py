"""
FiftyOne Server ontology endpoints.

| Copyright 2017-2026, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""

from typing import Any, Optional

from starlette.endpoints import HTTPEndpoint
from starlette.exceptions import HTTPException
from starlette.requests import Request

import fiftyone.core.odm as foo
import fiftyone.core.utils as fou
from fiftyone.core.annotation.nodes import find_in_dict, truncate_dict
from fiftyone.server.utils.json import JSONResponse


class Ontologies(HTTPEndpoint):
    """Endpoint that lists ontologies for the Schema Manager picker."""

    async def get(self, request: Request) -> JSONResponse:
        type_filter = request.query_params.get("type") or None
        name_filter = request.query_params.get("name") or None

        return JSONResponse(
            {
                "ontologies": await _list_ontology_summaries(
                    type_filter=type_filter, name_filter=name_filter
                )
            }
        )


class OntologyTaxonomy(HTTPEndpoint):
    """Returns the tree for a taxonomy.

    ``GET /ontologies/{name}/taxonomy`` — path parameter ``name`` is a
    :class:`fiftyone.core.ontology.Taxonomy`'s human-readable name.

    Optional query parameters:
        node: if set, root the response at this named node. 404 when no
            node with that name exists in the taxonomy.
        depth: if set, limit the response to this many levels below the
            response root. ``depth=0`` returns the root node with no
            children; truncated branches that had children in the source
            are serialized with ``"values": []`` so the caller can
            distinguish them from real leaves (no ``values`` key).

    Returns 404 when the named ontology does not exist or is not a
    taxonomy.
    """

    async def get(self, request: Request) -> JSONResponse:
        name = request.path_params["name"]
        node_name = request.query_params.get("node") or None

        depth_str = request.query_params.get("depth")
        if depth_str is None:
            depth = None
        else:
            try:
                depth = int(depth_str)
            except ValueError as e:
                raise HTTPException(
                    status_code=400,
                    detail="'depth' must be a non-negative integer",
                ) from e
            if depth < 0:
                raise HTTPException(
                    status_code=400,
                    detail="'depth' must be a non-negative integer",
                )

        body, error = await _load_taxonomy_response(name, node_name, depth)
        if error is not None:
            raise HTTPException(status_code=404, detail=error)

        return JSONResponse({"taxonomy": body})


class OntologyAttributes(HTTPEndpoint):
    """Returns the attributes list for a single annotation ontology.

    ``GET /ontologies/{name}/attributes`` — path parameter ``name`` is the
    ontology's human-readable name (URL-encoded). Each attribute dict in the
    response carries a ``_source`` key set to the ontology name, matching the
    format expected by the frontend merge logic.

    Returns 404 when the ontology does not exist or is not an annotation
    ontology.
    """

    async def get(self, request: Request) -> JSONResponse:
        name = request.path_params["name"]

        attributes = await fou.run_sync_task(_load_attributes, name)
        if attributes is None:
            raise HTTPException(
                status_code=404, detail=f"Ontology '{name}' not found"
            )

        return JSONResponse({"attributes": attributes})


async def _list_ontology_summaries(
    type_filter: Optional[str] = None,
    name_filter: Optional[str] = None,
) -> list[dict[str, Any]]:
    """Returns one summary per ontology (latest version only), sorted by
    ``last_modified_at`` descending.
    """
    # Optional filters; empty dict matches everything.
    match: dict[str, Any] = {}
    if type_filter:
        match["type"] = type_filter
    if name_filter:
        match["slug"] = fou.to_slug(name_filter)

    pipeline = [
        {"$match": match},
        # Order each slug's docs so the highest version is first; $first
        # in the next stage then picks that latest version.
        {"$sort": {"slug": 1, "version": -1}},
        {
            "$group": {
                "_id": "$slug",
                "name": {"$first": "$name"},
                "type": {"$first": "$type"},
                "version": {"$first": "$version"},
                "last_modified_at": {"$first": "$last_modified_at"},
                "taxonomy": {"$first": "$root.taxonomy"},
            }
        },
        {"$sort": {"last_modified_at": -1}},
        # Drop the grouping key from the output — clients consume
        # name/type/version/last_modified_at, not slug.
        {"$project": {"_id": 0}},
    ]

    collection = foo.get_async_db_conn()["ontologies"]
    summaries = await foo.aggregate(collection, pipeline).to_list(None)
    # Replace BSON datetimes with ISO strings so the JSON response is flat
    # (avoids the default ``{"$date": ...}`` BSON-extended-JSON shape).
    # ``last_modified_at`` may be missing on manually-inserted docs.
    for s in summaries:
        dt = s.get("last_modified_at")
        s["last_modified_at"] = dt.isoformat() if dt is not None else None
    return summaries


def _select_subtree(
    root_dict: dict[str, Any],
    taxonomy_name: str,
    node_name: Optional[str],
    depth: Optional[int],
) -> tuple[Optional[dict[str, Any]], Optional[str]]:
    """Applies the ``?node=`` and ``?depth=`` filters to a taxonomy root.

    Order matters: subtree selection happens before depth truncation so
    ``depth`` counts levels below the requested node, not below the
    original root.

    Returns a ``(subtree, error)`` pair with exactly one ``None``.
    """
    if node_name is not None:
        subtree = find_in_dict(root_dict, node_name)
        if subtree is None:
            return (
                None,
                f"Node '{node_name}' not found in taxonomy "
                f"'{taxonomy_name}'",
            )
    else:
        subtree = root_dict

    if depth is not None:
        subtree = truncate_dict(subtree, depth)

    return subtree, None


async def _load_taxonomy_doc(
    name: str,
) -> tuple[Optional[dict[str, Any]], Optional[str]]:
    """Fetches the latest version of a Taxonomy ontology document by
    name. Returns a ``(doc, error)`` pair with exactly one ``None``.
    """
    collection = foo.get_async_db_conn()["ontologies"]
    pipeline = [
        {"$match": {"slug": fou.to_slug(name)}},
        {"$sort": {"version": -1}},
        {"$limit": 1},
    ]
    docs = await foo.aggregate(collection, pipeline).to_list(1)
    if not docs:
        return None, f"Taxonomy '{name}' not found"

    doc = docs[0]
    if doc.get("type") != "taxonomy":
        return None, f"Ontology '{name}' is not a taxonomy"

    return doc, None


async def _load_taxonomy_response(
    name: str, node_name: Optional[str], depth: Optional[int]
) -> tuple[Optional[dict[str, Any]], Optional[str]]:
    """Resolves a taxonomy name and serializes the requested subtree.

    Returns a ``(body, error)`` pair with exactly one ``None``.
    """
    doc, error = await _load_taxonomy_doc(name)
    if error is not None:
        return None, error

    root_dict = doc.get("root") or {}
    subtree, error = _select_subtree(root_dict, doc["name"], node_name, depth)
    if error is not None:
        return None, error

    body: dict[str, Any] = {
        "name": doc["name"],
        "type": doc["type"],
        "version": doc.get("version"),
    }
    if doc.get("description") is not None:
        body["description"] = doc["description"]
    for field_name in ("created_at", "last_modified_at"):
        dt = doc.get(field_name)
        if dt is not None:
            body[field_name] = dt.isoformat()
    body["root"] = subtree
    return body, None


def _load_attributes(name: str) -> Optional[list[dict[str, Any]]]:
    """Returns the attributes list for an annotation ontology, or ``None``.

    Each attribute dict carries a ``_source`` key set to the ontology name so
    the frontend can tag and later strip ontology-owned attributes. Returns
    ``None`` when the ontology does not exist or is not an annotation ontology.

    This is a synchronous function intended to run inside
    :func:`fiftyone.core.utils.run_sync_task`.
    """
    from fiftyone.core.annotation.hydrate_label_schemas import (
        attributes_with_source,
    )
    from fiftyone.core.ontology import load_ontology

    try:
        ontology = load_ontology(name)
    except ValueError:
        return None

    if not ontology.is_annotation_ontology:
        return None

    return attributes_with_source(ontology)
