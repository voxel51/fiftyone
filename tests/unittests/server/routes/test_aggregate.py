"""
FiftyOne Server /aggregate route unit tests.

| Copyright 2017-2026, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""

import json
from unittest.mock import MagicMock

import pytest

import fiftyone as fo
import fiftyone.core.aggregations as foa
import fiftyone.server.routes.aggregate as fora


@pytest.fixture(name="dataset")
def fixture_dataset():
    """Creates a persistent dataset with samples for testing."""
    dataset = fo.Dataset()
    dataset.persistent = True
    samples = [
        fo.Sample(filepath=f"img_{i}.jpg", tags=["train" if i < 2 else "val"])
        for i in range(4)
    ]
    dataset.add_samples(samples)

    try:
        yield dataset
    finally:
        if fo.dataset_exists(dataset.name):
            fo.delete_dataset(dataset.name)


@pytest.fixture(name="grouped_dataset")
def fixture_grouped_dataset():
    """Creates a persistent grouped dataset for testing."""
    dataset = fo.Dataset()
    dataset.persistent = True
    dataset.add_group_field("group", default="left")
    groups = [fo.Group() for _ in range(3)]
    samples = []
    for i, group in enumerate(groups):
        samples.append(fo.Sample(filepath=f"left_{i}.jpg", group=group.element("left")))
        samples.append(fo.Sample(filepath=f"right_{i}.jpg", group=group.element("right")))
    dataset.add_samples(samples)

    try:
        yield dataset
    finally:
        if fo.dataset_exists(dataset.name):
            fo.delete_dataset(dataset.name)


async def _post_aggregate(payload):
    endpoint = fora.Aggregate(
        scope={"type": "http"}, receive=MagicMock(), send=MagicMock()
    )
    request = MagicMock()
    request.body = MagicMock(
        return_value=json.dumps(payload).encode("utf-8")
    )

    async def _body():
        return json.dumps(payload).encode("utf-8")

    request.body = _body
    response = await endpoint.post(request)
    return json.loads(response.body.decode("utf-8"))


_VALUES_ID_AGG = {
    "_cls": "fiftyone.core.aggregations.Values",
    "kwargs": [["field_or_expr", "id"]],
}


@pytest.mark.asyncio
async def test_aggregate_values_id_all_samples(dataset):
    result = await _post_aggregate(
        {
            "dataset": dataset.name,
            "aggregations": [_VALUES_ID_AGG],
        }
    )

    assert len(result["aggregate"]) == 1
    assert set(result["aggregate"][0]) == set(dataset.values("id"))


@pytest.mark.asyncio
async def test_aggregate_values_id_with_view_and_filters(dataset):
    train_view = dataset.match_tags("train")
    result = await _post_aggregate(
        {
            "dataset": dataset.name,
            "view": train_view._serialize(),
            "aggregations": [_VALUES_ID_AGG],
        }
    )

    assert set(result["aggregate"][0]) == set(train_view.values("id"))

    filtered = await _post_aggregate(
        {
            "dataset": dataset.name,
            "filters": {"tags": {"values": ["val"], "exclude": False}},
            "aggregations": [_VALUES_ID_AGG],
        }
    )

    val_view = dataset.match_tags("val")
    assert set(filtered["aggregate"][0]) == set(val_view.values("id"))


@pytest.mark.asyncio
async def test_aggregate_values_id_with_extended_and_slice(grouped_dataset):
    right_view = grouped_dataset.select_group_slices("right")
    result = await _post_aggregate(
        {
            "dataset": grouped_dataset.name,
            "slice": "right",
            "aggregations": [_VALUES_ID_AGG],
        }
    )

    assert set(result["aggregate"][0]) == set(right_view.values("id"))

    subset_ids = right_view.values("id")[:2]
    extended_result = await _post_aggregate(
        {
            "dataset": grouped_dataset.name,
            "slice": "right",
            "extended": {
                "fiftyone.core.stages.Select": {"sample_ids": subset_ids}
            },
            "aggregations": [_VALUES_ID_AGG],
        }
    )

    assert set(extended_result["aggregate"][0]) == set(subset_ids)
