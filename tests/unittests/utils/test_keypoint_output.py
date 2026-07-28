"""
Tests for KeypointOutputProcessor numpy serialization.

| Copyright 2017-2026, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""

import torch

from fiftyone.utils.torch import KeypointOutputProcessor


class TestKeypointOutputProcessorSerialization:
    """Ensure _parse_output returns native Python floats, not numpy scalars."""

    def test_points_are_native_floats(self):
        output = {
            "keypoints": torch.tensor([[[320.0, 240.0]]]),
            "keypoints_scores": torch.tensor([[5.0]]),  # high logit
        }
        processor = KeypointOutputProcessor()
        result = processor._parse_output(output, (640, 480), None)

        x, y = result.keypoints[0].points[0]
        assert type(x) is float, f"x is {type(x)}, expected float"
        assert type(y) is float, f"y is {type(y)}, expected float"
        assert x == 0.5, f"x is {x}, expected 0.5"
        assert y == 0.5, f"y is {y}, expected 0.5"
