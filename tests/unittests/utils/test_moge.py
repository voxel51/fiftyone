"""
Tests for fiftyone/utils/moge.py MoGe-3 model wrapper.

| Copyright 2017-2026, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""

import numpy as np
import pytest
import torch

import fiftyone.core.labels as fol


class TestMoGeModelConfig:
    """Test MoGeModelConfig parsing and defaults."""

    def test_default_config(self):
        from fiftyone.utils.moge import MoGeModelConfig

        config = MoGeModelConfig({})

        assert config.name_or_path == "Ruicheng/moge-3-vitl"
        assert config.resolution_level == 9
        assert config.num_tokens is None
        assert config.refine_steps == 3
        assert config.fov_x is None
        assert config.use_fp16 is False
        assert config.include_normals is False
        assert config.include_points is False
        assert config.raw_inputs is True
        assert config.output_processor_cls == (
            "fiftyone.utils.moge.MoGeOutputProcessor"
        )

    def test_custom_config(self):
        from fiftyone.utils.moge import MoGeModelConfig

        config = MoGeModelConfig(
            {
                "name_or_path": "Ruicheng/moge-3-vitg",
                "resolution_level": 5,
                "num_tokens": 2000,
                "refine_steps": 0,
                "fov_x": 60.0,
                "use_fp16": True,
                "include_normals": True,
                "include_points": True,
            }
        )

        assert config.name_or_path == "Ruicheng/moge-3-vitg"
        assert config.resolution_level == 5
        assert config.num_tokens == 2000
        assert config.refine_steps == 0
        assert config.fov_x == 60.0
        assert config.use_fp16 is True
        assert config.include_normals is True
        assert config.include_points is True


class TestMoGeOutputProcessor:
    """Test MoGeOutputProcessor."""

    def _make_processor(self):
        from fiftyone.utils.moge import MoGeOutputProcessor

        return MoGeOutputProcessor()

    def test_invalid_output_type_raises(self):
        processor = self._make_processor()

        with pytest.raises(TypeError, match="Expected dict output"):
            processor("not a dict", (2, 2))

    def test_missing_depth_key_raises(self):
        processor = self._make_processor()

        with pytest.raises(KeyError, match="missing 'depth' key"):
            processor({"mask": None}, (2, 2))

    def test_depth_is_normalized_and_metric(self):
        processor = self._make_processor()
        depth = np.array([[10.0, 20.0], [30.0, 40.0]], dtype=np.float32)

        results = processor({"depth": [depth]}, (2, 2))

        assert len(results) == 1
        heatmap = results[0]
        assert isinstance(heatmap, fol.Heatmap)
        assert heatmap.map.dtype == np.float32
        assert heatmap.map.max() == pytest.approx(1.0)
        assert heatmap.map[0, 0] == pytest.approx(0.25)
        assert heatmap.is_metric is True
        assert heatmap.max_depth == pytest.approx(40.0)
        np.testing.assert_array_almost_equal(
            heatmap.map * heatmap.max_depth, depth, decimal=5
        )

    def test_tensor_batch_is_split_per_image(self):
        processor = self._make_processor()
        depth = torch.tensor(
            [[[1.0, 2.0], [3.0, 4.0]], [[0.0, 100.0], [100.0, 100.0]]]
        )

        results = processor({"depth": depth}, (2, 2))

        assert len(results) == 2
        assert results[0].max_depth == pytest.approx(4.0)
        assert results[1].max_depth == pytest.approx(100.0)
        assert results[1].map[0, 0] == pytest.approx(0.0)

    def test_invalid_pixels_are_zeroed(self):
        processor = self._make_processor()
        depth = np.array([[np.inf, 2.0], [np.nan, 4.0]], dtype=np.float32)
        mask = np.array([[0, 1], [0, 1]], dtype=bool)

        results = processor({"depth": [depth], "mask": [mask]}, (2, 2))

        heatmap = results[0]
        assert heatmap.map[0, 0] == 0.0
        assert heatmap.map[1, 0] == 0.0
        assert heatmap.map[1, 1] == pytest.approx(1.0)
        np.testing.assert_array_equal(
            heatmap.valid_mask, np.array([[0, 1], [0, 1]], dtype=np.uint8)
        )

    def test_intrinsics_and_optional_maps_are_attached(self):
        processor = self._make_processor()
        depth = np.ones((2, 2), dtype=np.float32)
        intrinsics = torch.tensor(
            [[0.8, 0.0, 0.5], [0.0, 1.1, 0.5], [0.0, 0.0, 1.0]]
        )
        normal = np.zeros((2, 2, 3), dtype=np.float32)
        normal[..., 2] = -1.0
        points = np.ones((2, 2, 3), dtype=np.float32)

        results = processor(
            {
                "depth": [depth],
                "intrinsics": [intrinsics],
                "normal": [normal],
                "points": [points],
            },
            (2, 2),
        )

        heatmap = results[0]
        assert heatmap.intrinsics[0][0] == pytest.approx(0.8)
        assert len(heatmap.intrinsics) == 3
        assert heatmap.normal_map.shape == (2, 2, 3)
        assert heatmap.normal_map[0, 0, 2] == pytest.approx(-1.0)
        assert heatmap.point_map.shape == (2, 2, 3)

    def test_resize_to_frame_size(self):
        processor = self._make_processor()
        depth = np.array([[1.0, 2.0], [3.0, 4.0]], dtype=np.float32)
        mask = np.ones((2, 2), dtype=bool)
        normal = np.zeros((2, 2, 3), dtype=np.float32)

        results = processor(
            {"depth": [depth], "mask": [mask], "normal": [normal]}, (4, 4)
        )

        heatmap = results[0]
        assert heatmap.map.shape == (4, 4)
        assert heatmap.valid_mask.shape == (4, 4)
        assert heatmap.normal_map.shape == (4, 4, 3)
        assert heatmap.map[0, 0] < heatmap.map[3, 3]

    def test_none_frame_size_skips_resize(self):
        processor = self._make_processor()
        depth = np.random.rand(50, 60).astype(np.float32)

        results = processor({"depth": [depth]}, (None, None))

        assert results[0].map.shape == (50, 60)

    def test_zero_depth_returns_zeros(self):
        processor = self._make_processor()
        depth = np.zeros((3, 3), dtype=np.float32)

        results = processor({"depth": [depth]}, (3, 3))

        assert np.all(results[0].map == 0)
        assert results[0].max_depth == 0.0
