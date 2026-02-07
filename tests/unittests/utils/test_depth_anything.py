"""
Tests for fiftyone/utils/depth_anything.py Depth Anything V3 model wrapper.

| Copyright 2017-2026, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""

import numpy as np
import pytest
import torch

import fiftyone.core.labels as fol


class TestDepthAnythingV3ModelConfig:
    """Test DepthAnythingV3ModelConfig parsing and defaults."""

    def test_default_config(self):
        """Test default configuration values."""
        from fiftyone.utils.depth_anything import DepthAnythingV3ModelConfig

        config = DepthAnythingV3ModelConfig({})

        assert config.name_or_path == "depth-anything/da3-base"
        assert config.raw_inputs is True
        assert config.output_processor_cls == (
            "fiftyone.utils.depth_anything.DepthAnythingV3OutputProcessor"
        )

    def test_custom_name_or_path(self):
        """Test custom name_or_path overrides default."""
        from fiftyone.utils.depth_anything import DepthAnythingV3ModelConfig

        config = DepthAnythingV3ModelConfig({
            "name_or_path": "depth-anything/da3-large"
        })

        assert config.name_or_path == "depth-anything/da3-large"

    def test_use_ray_pose_default(self):
        """Test use_ray_pose defaults to False."""
        from fiftyone.utils.depth_anything import DepthAnythingV3ModelConfig

        config = DepthAnythingV3ModelConfig({})

        assert config.use_ray_pose is False

    def test_use_ray_pose_explicit(self):
        """Test use_ray_pose can be set explicitly."""
        from fiftyone.utils.depth_anything import DepthAnythingV3ModelConfig

        config_true = DepthAnythingV3ModelConfig({"use_ray_pose": True})
        assert config_true.use_ray_pose is True

        config_false = DepthAnythingV3ModelConfig({"use_ray_pose": False})
        assert config_false.use_ray_pose is False


class TestDepthAnythingV3OutputProcessor:
    """Test DepthAnythingV3OutputProcessor."""

    def _make_processor(self) -> "DepthAnythingV3OutputProcessor":
        from fiftyone.utils.depth_anything import DepthAnythingV3OutputProcessor
        return DepthAnythingV3OutputProcessor()

    def test_invalid_output_type_raises(self):
        """Test non-dict input raises TypeError."""
        processor = self._make_processor()

        with pytest.raises(TypeError, match="Expected dict output"):
            processor("not a dict", (100, 100))

        with pytest.raises(TypeError, match="Expected dict output"):
            processor([1, 2, 3], (100, 100))

    def test_missing_depth_key_raises(self):
        """Test missing depth key raises KeyError."""
        processor = self._make_processor()

        with pytest.raises(KeyError, match="missing 'depth' key"):
            processor({"other": 123}, (100, 100))

        with pytest.raises(KeyError, match="missing 'depth' key"):
            processor({}, (100, 100))

    def test_tensor_to_numpy_conversion_preserves_values(self):
        """Test torch.Tensor values are preserved after conversion."""
        processor = self._make_processor()
        depth_values = np.array([[[0.2, 0.4], [0.6, 0.8]]], dtype=np.float32)
        depth_tensor = torch.from_numpy(depth_values.copy())

        results = processor({"depth": depth_tensor}, (2, 2))

        expected_normalized = depth_values[0] / 0.8
        np.testing.assert_array_almost_equal(
            results[0].map, expected_normalized, decimal=5
        )

    def test_2d_depth_expansion_produces_single_heatmap(self):
        """Test 2D depth array is expanded and processed as single image."""
        processor = self._make_processor()
        depth_2d = np.array([[1.0, 2.0], [3.0, 4.0]], dtype=np.float32)

        results = processor({"depth": depth_2d}, (2, 2))

        assert len(results) == 1
        expected = depth_2d / 4.0
        np.testing.assert_array_almost_equal(results[0].map, expected, decimal=5)

    def test_depth_normalization_scales_to_unit_range(self):
        """Test depth values are normalized to [0, 1] with max=1."""
        processor = self._make_processor()
        depth = np.array([[[10.0, 20.0], [30.0, 40.0]]], dtype=np.float32)

        results = processor({"depth": depth}, (2, 2))

        heatmap = results[0]
        assert heatmap.map.max() == pytest.approx(1.0)
        assert heatmap.map.min() == pytest.approx(0.25)
        assert heatmap.map[0, 0] == pytest.approx(0.25)
        assert heatmap.map[0, 1] == pytest.approx(0.50)
        assert heatmap.map[1, 0] == pytest.approx(0.75)
        assert heatmap.map[1, 1] == pytest.approx(1.00)

    def test_depth_normalization_zero_max_returns_zeros(self):
        """Test zero max depth returns zeros without division error."""
        processor = self._make_processor()
        depth = np.zeros((1, 10, 10), dtype=np.float32)

        results = processor({"depth": depth}, (10, 10))

        assert results[0].map.shape == (10, 10)
        assert np.all(results[0].map == 0)

    def test_output_dtype_is_float32(self):
        """Test output heatmap dtype is float32 regardless of input dtype."""
        processor = self._make_processor()

        for input_dtype in [np.float32, np.float64, np.int32]:
            depth = np.ones((1, 5, 5), dtype=input_dtype) * 10
            results = processor({"depth": depth}, (5, 5))
            assert results[0].map.dtype == np.float32

    def test_resize_interpolates_to_frame_size(self):
        """Test depth is resized to match frame_size with interpolation."""
        processor = self._make_processor()
        depth = np.array([[[1.0, 2.0], [3.0, 4.0]]], dtype=np.float32)

        results = processor({"depth": depth}, (4, 4))

        assert results[0].map.shape == (4, 4)
        corners = [
            results[0].map[0, 0],
            results[0].map[0, 3],
            results[0].map[3, 0],
            results[0].map[3, 3],
        ]
        assert corners[0] < corners[1] < corners[2] < corners[3]

    def test_batch_processing_normalizes_each_independently(self):
        """Test each depth map in batch is normalized independently."""
        processor = self._make_processor()
        depth = np.array([
            [[0.0, 10.0], [10.0, 10.0]],
            [[0.0, 100.0], [100.0, 100.0]],
        ], dtype=np.float32)

        results = processor({"depth": depth}, (2, 2))

        assert len(results) == 2
        assert results[0].map.max() == pytest.approx(1.0)
        assert results[1].map.max() == pytest.approx(1.0)
        np.testing.assert_array_almost_equal(results[0].map, results[1].map, decimal=5)

    def test_none_frame_size_skips_resize(self):
        """Test None dimensions in frame_size skips resize."""
        processor = self._make_processor()
        depth = np.random.rand(1, 50, 60).astype(np.float32)

        results = processor({"depth": depth}, (None, None))

        assert results[0].map.shape == (50, 60)
