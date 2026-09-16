"""
FiftyOne Server /get-similar-labels-frames route unit tests.

| Copyright 2017-2026, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""

import json

# pylint: disable=no-value-for-parameter
from unittest.mock import AsyncMock, MagicMock

from bson import json_util
import pytest

import fiftyone as fo
import fiftyone.core.labels as fol
from fiftyone.server.routes.get_similar_labels_frames import (
    GetSimilarLabelsFrameCollection,
)


@pytest.fixture(name="dataset")
def fixture_dataset():
    dataset = fo.Dataset()
    dataset.persistent = True

    try:
        yield dataset
    finally:
        if fo.dataset_exists(dataset.name):
            fo.delete_dataset(dataset.name)


@pytest.fixture(name="tracked")
def fixture_tracked(dataset):
    """A video sample whose instance appears on frames 1, 2 and 4 alongside
    an unrelated detection on every frame."""
    instance = fol.Instance()
    sample = fo.Sample(filepath="/tmp/tracked.mp4")

    for frame_number in range(1, 5):
        detections = [fo.Detection(label="other", bounding_box=[0, 0, 1, 1])]
        if frame_number != 3:
            detections.append(
                fo.Detection(
                    label="car", bounding_box=[0, 0, 1, 1], instance=instance
                )
            )

        sample.frames[frame_number] = fo.Frame(
            detections=fo.Detections(detections=detections)
        )

    dataset.add_sample(sample)

    expected = {
        str(det.id): frame_number
        for frame_number, frame in sample.frames.items()
        for det in frame.detections.detections
        if getattr(det, "instance", None) is not None
    }

    return sample, str(instance.id), expected


def _make_request(data):
    request = MagicMock()
    request.body = AsyncMock(
        return_value=json_util.dumps(data).encode("utf-8")
    )
    return request


def _endpoint():
    return GetSimilarLabelsFrameCollection(
        scope={"type": "http"}, receive=AsyncMock(), send=AsyncMock()
    )


@pytest.mark.asyncio
async def test_scans_every_frame_without_a_frame_count(dataset, tracked):
    sample, instance_id, expected = tracked

    response = await _endpoint().post(
        _make_request(
            {
                "instanceId": instance_id,
                "sampleId": sample.id,
                "dataset": dataset.name,
                "view": [],
            }
        )
    )

    assert response.status_code == 200
    body = json.loads(response.body)
    assert body["label_id_map"] == expected
    assert body["count"] == 3
    assert body["range"] is None


@pytest.mark.asyncio
async def test_frame_count_bounds_the_scan(dataset, tracked):
    sample, instance_id, expected = tracked

    response = await _endpoint().post(
        _make_request(
            {
                "instanceId": instance_id,
                "sampleId": sample.id,
                "dataset": dataset.name,
                "numFrames": 2,
                "view": [],
            }
        )
    )

    assert response.status_code == 200
    body = json.loads(response.body)
    assert body["label_id_map"] == {
        label_id: frame_number
        for label_id, frame_number in expected.items()
        if frame_number <= 2
    }
    assert body["range"] == [1, 2]


@pytest.mark.asyncio
async def test_rejects_a_non_positive_frame_count(dataset, tracked):
    sample, instance_id, _ = tracked

    response = await _endpoint().post(
        _make_request(
            {
                "instanceId": instance_id,
                "sampleId": sample.id,
                "dataset": dataset.name,
                "numFrames": 0,
            }
        )
    )

    assert response.status_code == 400
