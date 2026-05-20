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

        body, error = await fou.run_sync_task(
            _load_taxonomy_response, name, node_name, depth
        )
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


def _load_taxonomy_response(
    name: str, node_name: Optional[str], depth: Optional[int]
) -> tuple[Optional[dict[str, Any]], Optional[str]]:
    """Resolves a taxonomy name and serializes the requested subtree.

    Returns a ``(body, error)`` pair: ``body`` is the response dict on
    success and ``error`` is the 404 detail string on failure. Exactly
    one is ``None``.
    """
    from fiftyone.core.ontology import Ontology, load_ontology

    try:
        target_taxonomy = load_ontology(name)
    except ValueError:
        return None, f"Taxonomy '{name}' not found"

    if not target_taxonomy.is_taxonomy:
        return None, f"Ontology '{name}' is not a taxonomy"

    # Narrow the response to the named subtree when requested.
    if node_name is not None:
        target_node = target_taxonomy.root.find(node_name)
        if target_node is None:
            return (
                None,
                f"Node '{node_name}' not found in taxonomy "
                f"'{target_taxonomy.name}'",
            )
    else:
        target_node = target_taxonomy.root

    # Truncate the subtree when a depth cap is requested.
    if depth is not None:
        target_node = target_node.truncated(depth)

    # Build the response from ontology metadata + the filtered subtree.
    # Calling the base ``Ontology.to_dict`` skips the subclass override
    # that would re-serialize the full root tree we just filtered.
    body = Ontology.to_dict(target_taxonomy)
    body["root"] = target_node.to_dict()
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
