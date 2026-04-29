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

import fiftyone.core.utils as fou
from fiftyone.core.odm.ontology import OntologyDocument
from fiftyone.internal.features.registry import is_feature_enabled
from fiftyone.server.utils.json import JSONResponse


class Ontologies(HTTPEndpoint):
    """Endpoint that lists ontologies for the Schema Manager picker."""

    async def get(self, request: Request) -> JSONResponse:
        if not is_feature_enabled("VFF_ONTOLOGY_CA"):
            raise HTTPException(status_code=404)

        type_filter = request.query_params.get("type") or None
        name_filter = request.query_params.get("name") or None

        return JSONResponse(
            {
                "ontologies": _list_ontology_summaries(
                    type_filter=type_filter, name_filter=name_filter
                )
            }
        )


def _list_ontology_summaries(
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

    # pylint: disable-next=no-member
    summaries = list(OntologyDocument.objects.aggregate(pipeline))
    # Replace BSON datetimes with ISO strings so the JSON response is flat
    # (avoids the default ``{"$date": ...}`` BSON-extended-JSON shape).
    for s in summaries:
        s["last_modified_at"] = s["last_modified_at"].isoformat()
    return summaries
