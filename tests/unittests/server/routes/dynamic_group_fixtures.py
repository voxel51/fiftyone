"""
Shared fixtures for the FiftyOne Server dynamic group PATCH route tests.

| Copyright 2017-2026, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""

# pylint: disable=no-value-for-parameter
from unittest.mock import AsyncMock, MagicMock

from bson import ObjectId, json_util
import pytest

import fiftyone as fo
import fiftyone.core.labels as fol
import fiftyone.core.stages as fosg
import fiftyone.server.routes.dynamic_group as ford
import fiftyone.server.view as fosv

SCENE = "scene-a"
OTHER_SCENE = "scene-b"
FRAMES_PER_SCENE = 3

DETECTION_IDS = {
    (scene, frame_number): ObjectId()
    for scene in (SCENE, OTHER_SCENE)
    for frame_number in range(1, FRAMES_PER_SCENE + 1)
}


def json_payload(payload) -> bytes:
    """Converts a dictionary to a JSON payload."""
    return json_util.dumps(payload).encode("utf-8")


@pytest.fixture(name="dataset")
def fixture_dataset():
    """An image dataset dynamically groupable into ordered scenes."""
    dataset = fo.Dataset()

    samples = []
    for scene in (SCENE, OTHER_SCENE):
        for frame_number in range(1, FRAMES_PER_SCENE + 1):
            sample = fo.Sample(
                filepath=f"/tmp/{scene}-{frame_number}.jpg",
                scene_id=scene,
                frame_number=frame_number,
            )
            sample["detections"] = fol.Detections(
                detections=[
                    fol.Detection(
                        id=DETECTION_IDS[(scene, frame_number)],
                        label="cat",
                        bounding_box=[0.1, 0.1, 0.2, 0.2],
                    )
                ]
            )
            samples.append(sample)

    dataset.add_samples(samples)

    try:
        yield dataset
    finally:
        if fo.dataset_exists(dataset.name):
            fo.delete_dataset(dataset.name)


@pytest.fixture(name="stages")
def fixture_stages():
    """The serialized GroupBy stage defining the dynamic grouping."""
    return [fosg.GroupBy("scene_id", order_by="frame_number")._serialize()]


@pytest.fixture(name="group_view")
def fixture_group_view(dataset, stages):
    """The ordered member view of the scene under test."""
    return fosv.get_view(dataset.name, stages=stages, dynamic_group=SCENE)


@pytest.fixture(name="group_token")
def fixture_group_token(group_view):
    """The current group version token."""
    _, lmts = group_view.values(["id", "last_modified_at"])
    return ford.generate_group_etag(max(lmts), len(lmts))


@pytest.fixture(name="members")
def fixture_members(dataset, group_view):
    """The scene's ordered member samples, loaded through the dataset because
    the view's injected `_group` field is rejected by the `Sample` loader."""
    return [dataset[_id] for _id in group_view.values("id")]


@pytest.fixture(name="mutator")
def fixture_mutator():
    """Returns the DynamicGroup route mutator."""
    return ford.DynamicGroup(
        scope={"type": "http"}, receive=AsyncMock(), send=AsyncMock()
    )


@pytest.fixture(name="mock_request")
def fixture_mock_request(dataset, group_token):
    """A PATCH request against the dataset's dynamic-group route."""
    # pylint: disable-next=protected-access
    mock_request = MagicMock()
    mock_request.path_params = {"dataset_id": dataset._doc.id}
    mock_request.headers = {
        "Content-Type": "application/json",
        "If-Match": group_token,
    }
    mock_request.body = AsyncMock(return_value=json_payload({}))

    return mock_request


def body(stages, patches, dynamic_group=SCENE):
    return {
        "dynamicGroup": dynamic_group,
        "view": stages,
        "patches": patches,
    }


def replace_label(sample, label):
    detection_id = str(sample["detections"].detections[0].id)
    return {
        "sampleId": str(sample.id),
        "patch": [
            {
                "op": "replace",
                "path": "/detections/detections/0/label",
                "value": label,
            }
        ],
    }
