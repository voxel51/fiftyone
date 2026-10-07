"""
Frame window bounds on the frames and video labels routes.

| Copyright 2017-2026, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""

from unittest.mock import AsyncMock, MagicMock

from bson import json_util
import pytest
from starlette.exceptions import HTTPException

import fiftyone.server.routes.frames as forf
import fiftyone.server.routes.video_labels as forv


def _request(payload) -> MagicMock:
    request = MagicMock()
    request.body = AsyncMock(
        return_value=json_util.dumps(payload).encode("utf-8")
    )
    return request


def _endpoint(cls):
    return cls(scope={"type": "http"}, receive=AsyncMock(), send=AsyncMock())


class TestFrameWindowBounds:
    """Frames are 1-indexed: a window that starts below 1, or ends before it
    starts, is a 400, not a driver error."""

    @pytest.mark.asyncio
    @pytest.mark.parametrize("frame_number", [0, -3])
    async def test_frames_start_below_one(self, frame_number):
        """The frames route 400s a window starting below frame 1."""
        request = _request(
            {
                "frameNumber": frame_number,
                "numFrames": 5,
                "dataset": "unused",
                "sampleId": "unused",
                "dynamicGroup": "scene",
            }
        )

        with pytest.raises(HTTPException) as exc_info:
            # pylint: disable-next=no-value-for-parameter
            await _endpoint(forf.Frames).post(request)

        assert exc_info.value.status_code == 400

    @pytest.mark.asyncio
    @pytest.mark.parametrize(
        "start_frame, end_frame", [(0, 4), (-1, 2), (5, 3)]
    )
    async def test_window_bad_bounds(self, start_frame, end_frame):
        """The labels window 400s a start below 1 or an end before it."""
        request = _request(
            {
                "startFrame": start_frame,
                "endFrame": end_frame,
                "dataset": "unused",
                "sampleId": "unused",
                "dynamicGroup": "scene",
            }
        )

        with pytest.raises(HTTPException) as exc_info:
            # pylint: disable-next=no-value-for-parameter
            await _endpoint(forv.VideoLabelsWindow).post(request)

        assert exc_info.value.status_code == 400
