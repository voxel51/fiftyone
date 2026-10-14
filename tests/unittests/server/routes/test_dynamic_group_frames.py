"""
Dynamic group "frames": the ordinal never touches the sample documents.

| Copyright 2017-2026, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""

import json
from unittest.mock import AsyncMock, MagicMock

from bson import json_util
import pytest

import fiftyone as fo
import fiftyone.core.labels as fol
import fiftyone.core.stages as fosg
import fiftyone.server.routes.frames as forf
import fiftyone.server.routes.video_labels as forv
import fiftyone.server.view as fosv

SCENE = "scene-a"
# Real frame numbers that differ from the samples' rank in the group, so a
# rank leaking into the document would show
REAL_FRAME_NUMBERS = [10, 20, 30]


@pytest.fixture(name="dataset")
def fixture_dataset():
    """A scene whose samples carry their own `frame_number` field."""
    dataset = fo.Dataset()
    dataset.add_samples(
        [
            fo.Sample(
                filepath=f"/tmp/{SCENE}-{frame_number}.jpg",
                scene_id=SCENE,
                frame_number=frame_number,
                detections=fol.Detections(
                    detections=[
                        fol.Detection(
                            label="cat", bounding_box=[0.1, 0.1, 0.2, 0.2]
                        )
                    ]
                ),
            )
            for frame_number in REAL_FRAME_NUMBERS
        ]
    )

    try:
        yield dataset
    finally:
        if fo.dataset_exists(dataset.name):
            fo.delete_dataset(dataset.name)


@pytest.fixture(name="stages")
def fixture_stages():
    """The serialized GroupBy stage defining the dynamic grouping."""
    # pylint: disable-next=protected-access
    return [fosg.GroupBy("scene_id", order_by="frame_number")._serialize()]


class TestDynamicGroupFrames:
    """The frames route and the labels index over a dynamic group."""

    @pytest.mark.asyncio
    async def test_frames_serve_documents_as_stored(self, dataset, stages):
        """The i-th document is frame ``range[0] + i``; its own
        ``frame_number`` field is untouched."""
        request = MagicMock()
        request.body = AsyncMock(
            return_value=json_util.dumps(
                {
                    "dataset": dataset.name,
                    "view": stages,
                    "dynamicGroup": SCENE,
                    "frameNumber": 1,
                    "numFrames": 3,
                    "frameCount": 3,
                }
            ).encode("utf-8")
        )
        endpoint = forf.Frames(
            scope={"type": "http"}, receive=AsyncMock(), send=AsyncMock()
        )

        # pylint: disable-next=no-value-for-parameter
        response = await endpoint.post(request)
        body = json.loads(response.body)

        assert body["range"] == [1, 3]
        assert [
            frame["frame_number"] for frame in body["frames"]
        ] == REAL_FRAME_NUMBERS

    @pytest.mark.asyncio
    async def test_index_frames_are_ranks(self, dataset, stages):
        """The index numbers frames by rank in the group, not by any
        ``frame_number`` field the samples carry."""
        view = fosv.get_view(dataset.name, stages=stages, dynamic_group=SCENE)

        result = await forv.aggregate_index(
            view, ["detections"], dynamic_group=True
        )

        frames = sorted(
            start
            for instance in result["detections"]["instances"]
            for start, _ in instance["segments"]
        )
        assert frames == [1, 2, 3]
