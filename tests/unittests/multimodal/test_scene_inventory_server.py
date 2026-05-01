"""
Multimodal scene inventory server tests.

| Copyright 2017-2026, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""

import json
from unittest.mock import AsyncMock, MagicMock

import pytest
from starlette.exceptions import HTTPException
from starlette.requests import Request

from fiftyone.multimodal.query import resolve_scene_inventory
from fiftyone.multimodal.schemas import v1 as foms
from fiftyone.multimodal.server import (
    PROTOBUF_MEDIA_TYPE,
    SceneInventoryEndpoint,
)


def _json_payload(payload: dict) -> bytes:
    return json.dumps(payload).encode("utf-8")


def _make_endpoint() -> SceneInventoryEndpoint:
    return SceneInventoryEndpoint(
        scope={"type": "http"},
        receive=AsyncMock(),
        send=AsyncMock(),
    )


def _make_request(payload: dict) -> Request:
    request = MagicMock(spec=Request)
    request.body = AsyncMock(return_value=_json_payload(payload))
    return request


def test_resolve_scene_inventory_returns_serializable_proto():
    inventory = resolve_scene_inventory("dataset-1", "sample-1")

    round_trip = foms.SceneInventory()
    round_trip.ParseFromString(inventory.SerializeToString())

    assert round_trip.inventory_id == "mock-inventory:dataset-1:sample-1"
    assert round_trip.source_format == "mock"
    assert len(round_trip.streams) == 3
    assert len(round_trip.time_tracks) == 2
    assert round_trip.metadata["dataset_id"] == "dataset-1"
    assert round_trip.metadata["sample_id"] == "sample-1"


@pytest.mark.asyncio
async def test_scene_inventory_endpoint_returns_protobuf():
    endpoint = _make_endpoint()
    request = _make_request(
        {"dataset_id": "dataset-1", "sample_id": "sample-1"}
    )

    response = await endpoint.post(request)

    assert response.status_code == 200
    assert response.media_type == PROTOBUF_MEDIA_TYPE

    inventory = foms.SceneInventory()
    inventory.ParseFromString(response.body)

    assert inventory.inventory_id == "mock-inventory:dataset-1:sample-1"
    assert inventory.scene_id == "mock-scene:sample-1"
    assert inventory.streams[0].display_name == "Front camera"


@pytest.mark.asyncio
@pytest.mark.parametrize(
    "payload",
    [
        {"sample_id": "sample-1"},
        {"dataset_id": "dataset-1"},
        {"dataset_id": "", "sample_id": "sample-1"},
        {"dataset_id": "dataset-1", "sample_id": ""},
    ],
)
async def test_scene_inventory_endpoint_requires_dataset_and_sample(payload):
    endpoint = _make_endpoint()
    request = _make_request(payload)

    with pytest.raises(HTTPException) as exc:
        await endpoint.post(request)

    assert exc.value.status_code == 400
