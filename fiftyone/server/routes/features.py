"""
FiftyOne Server feature endpoints.

| Copyright 2017-2026, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""

from dataclasses import dataclass, asdict

from starlette.endpoints import HTTPEndpoint
from starlette.requests import Request

from fiftyone.internal.features.registry import list_enabled_features
from fiftyone.server import decorators


@dataclass
class ListFeaturesResponse:
    """Response type for ListFeatures endpoint."""

    features: list[str]
    """List of enabled features."""


class Features(HTTPEndpoint):
    """Endpoints supporting feature flags for safer internal development."""

    @decorators.route(parse_body=False)
    async def get(self, _request: Request) -> dict:
        """Get a list of enabled features."""
        return asdict(
            ListFeaturesResponse(
                features=list_enabled_features(),
            )
        )
