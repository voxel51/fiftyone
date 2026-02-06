"""
Tests for fiftyone/utils/mapanything.py MapAnything model wrapper.

| Copyright 2017-2026, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""

import os
import tempfile

import numpy as np
import pytest
import torch
from PIL import Image
from unittest.mock import patch, MagicMock

import fiftyone.core.labels as fol


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _make_model(output_type="depth"):
    """Create a minimal MapAnythingModel without loading weights."""
    from fiftyone.utils.mapanything import MapAnythingModel

    model = MapAnythingModel.__new__(MapAnythingModel)
    model._output_type = output_type
    model._use_amp = True
    model._amp_dtype = "bf16"
    model._device = torch.device("cpu")
    return model


def _mock_pred(h=518, w=518, depth_val=None):
    """Build a fake prediction dict matching MapAnything output schema."""
    if depth_val is None:
        depth = torch.rand(h, w, 1)
    else:
        depth = torch.full((h, w, 1), depth_val)
    return {
        "depth_z": [depth],
        "intrinsics": [torch.eye(3)],
        "camera_poses": [torch.eye(4)],
        "mask": [torch.ones(h, w, 1)],
    }


def _patch_infer(model, pred):
    """Attach a mocked _model.infer that returns ``[pred]``."""
    model._model = MagicMock()
    model._model.infer = MagicMock(return_value=[pred])


def _patch_load_images():
    """Return a context manager that stubs ``load_images``."""
    return patch(
        "fiftyone.utils.mapanything.mapanything_image.load_images",
        return_value=[{"img": torch.rand(1, 3, 518, 518)}],
    )


def _patch_depthmap_to_world(pts3d, valid):
    """Return a context manager that stubs ``depthmap_to_world_frame``."""
    return patch(
        "fiftyone.utils.mapanything.mapanything_geometry.depthmap_to_world_frame",
        return_value=(pts3d, valid),
    )


# ===================================================================
# Config (16 tests)
# ===================================================================

class TestMapAnythingModelConfig:
    """Test MapAnythingModelConfig parsing and defaults."""

    def test_default_hf_repo(self):
        from fiftyone.utils.mapanything import MapAnythingModelConfig
        config = MapAnythingModelConfig({})
        assert config.hf_repo == "facebook/map-anything-apache"

    def test_default_output_type(self):
        from fiftyone.utils.mapanything import MapAnythingModelConfig
        config = MapAnythingModelConfig({})
        assert config.output_type == "depth"

    def test_default_use_amp(self):
        from fiftyone.utils.mapanything import MapAnythingModelConfig
        config = MapAnythingModelConfig({})
        assert config.use_amp is True

    def test_default_amp_dtype(self):
        from fiftyone.utils.mapanything import MapAnythingModelConfig
        config = MapAnythingModelConfig({})
        assert config.amp_dtype == "bf16"

    def test_custom_hf_repo(self):
        from fiftyone.utils.mapanything import MapAnythingModelConfig
        config = MapAnythingModelConfig({"hf_repo": "facebook/map-anything"})
        assert config.hf_repo == "facebook/map-anything"

    def test_output_type_depth(self):
        from fiftyone.utils.mapanything import MapAnythingModelConfig
        config = MapAnythingModelConfig({"output_type": "depth"})
        assert config.output_type == "depth"

    def test_output_type_pointcloud(self):
        from fiftyone.utils.mapanything import MapAnythingModelConfig
        config = MapAnythingModelConfig({"output_type": "pointcloud"})
        assert config.output_type == "pointcloud"

    def test_use_amp_false(self):
        from fiftyone.utils.mapanything import MapAnythingModelConfig
        config = MapAnythingModelConfig({"use_amp": False})
        assert config.use_amp is False

    def test_amp_dtype_fp16(self):
        from fiftyone.utils.mapanything import MapAnythingModelConfig
        config = MapAnythingModelConfig({"amp_dtype": "fp16"})
        assert config.amp_dtype == "fp16"

    def test_amp_dtype_fp32(self):
        from fiftyone.utils.mapanything import MapAnythingModelConfig
        config = MapAnythingModelConfig({"amp_dtype": "fp32"})
        assert config.amp_dtype == "fp32"

    def test_combined_depth(self):
        from fiftyone.utils.mapanything import MapAnythingModelConfig
        config = MapAnythingModelConfig({
            "hf_repo": "facebook/map-anything-apache",
            "output_type": "depth",
            "use_amp": True,
            "amp_dtype": "bf16",
        })
        assert config.hf_repo == "facebook/map-anything-apache"
        assert config.output_type == "depth"
        assert config.use_amp is True
        assert config.amp_dtype == "bf16"

    def test_combined_pointcloud(self):
        from fiftyone.utils.mapanything import MapAnythingModelConfig
        config = MapAnythingModelConfig({
            "hf_repo": "facebook/map-anything",
            "output_type": "pointcloud",
            "use_amp": False,
            "amp_dtype": "fp32",
        })
        assert config.hf_repo == "facebook/map-anything"
        assert config.output_type == "pointcloud"
        assert config.use_amp is False
        assert config.amp_dtype == "fp32"

    def test_type_inheritance(self):
        from fiftyone.utils.mapanything import MapAnythingModelConfig
        import fiftyone.utils.torch as fout
        import fiftyone.zoo.models as fozm
        config = MapAnythingModelConfig({})
        assert isinstance(config, fout.TorchImageModelConfig)
        assert isinstance(config, fozm.HasZooModel)

    def test_unknown_keys_ignored(self):
        from fiftyone.utils.mapanything import MapAnythingModelConfig
        config = MapAnythingModelConfig({
            "hf_repo": "facebook/map-anything-apache",
            "totally_bogus_key": 42,
        })
        assert config.hf_repo == "facebook/map-anything-apache"

    def test_empty_string_hf_repo(self):
        from fiftyone.utils.mapanything import MapAnythingModelConfig
        config = MapAnythingModelConfig({"hf_repo": ""})
        assert config.hf_repo == ""

    def test_output_type_arbitrary_string(self):
        from fiftyone.utils.mapanything import MapAnythingModelConfig
        config = MapAnythingModelConfig({"output_type": "mesh"})
        assert config.output_type == "mesh"


# ===================================================================
# Input conversion — _to_pil (14 tests)
# ===================================================================

class TestMapAnythingToPil:
    """Test MapAnythingModel._to_pil input conversion."""

    def test_pil_rgb_passthrough(self):
        model = _make_model()
        img = Image.new("RGB", (100, 80), color=(255, 128, 64))
        result = model._to_pil(img)
        assert result.mode == "RGB"
        assert result.size == (100, 80)

    def test_pil_rgba_to_rgb(self):
        model = _make_model()
        img = Image.new("RGBA", (50, 50), color=(100, 150, 200, 255))
        result = model._to_pil(img)
        assert result.mode == "RGB"
        assert result.size == (50, 50)

    def test_pil_grayscale_to_rgb(self):
        model = _make_model()
        img = Image.new("L", (30, 30), color=128)
        result = model._to_pil(img)
        assert result.mode == "RGB"
        assert result.size == (30, 30)

    def test_pil_palette_to_rgb(self):
        model = _make_model()
        img = Image.new("P", (40, 40))
        result = model._to_pil(img)
        assert result.mode == "RGB"

    def test_pil_cmyk_to_rgb(self):
        model = _make_model()
        img = Image.new("CMYK", (25, 25))
        result = model._to_pil(img)
        assert result.mode == "RGB"

    def test_pil_1bit_to_rgb(self):
        model = _make_model()
        img = Image.new("1", (20, 20))
        result = model._to_pil(img)
        assert result.mode == "RGB"

    def test_numpy_uint8(self):
        model = _make_model()
        arr = np.random.randint(0, 255, (64, 64, 3), dtype=np.uint8)
        result = model._to_pil(arr)
        assert result.mode == "RGB"
        assert result.size == (64, 64)

    def test_numpy_preserves_pixels(self):
        model = _make_model()
        arr = np.zeros((10, 10, 3), dtype=np.uint8)
        arr[5, 5] = [255, 0, 128]
        result = model._to_pil(arr)
        px = result.getpixel((5, 5))
        assert px == (255, 0, 128)

    def test_filepath_png(self, tmp_path):
        model = _make_model()
        p = str(tmp_path / "test.png")
        Image.new("RGB", (32, 32), color=(10, 20, 30)).save(p)
        result = model._to_pil(p)
        assert result.mode == "RGB"
        assert result.size == (32, 32)

    def test_filepath_jpeg(self, tmp_path):
        model = _make_model()
        p = str(tmp_path / "test.jpg")
        Image.new("RGB", (48, 48), color=(200, 100, 50)).save(p)
        result = model._to_pil(p)
        assert result.mode == "RGB"
        assert result.size == (48, 48)

    def test_tiny_image(self):
        model = _make_model()
        img = Image.new("RGB", (1, 1), color=(42, 42, 42))
        result = model._to_pil(img)
        assert result.size == (1, 1)

    def test_large_image(self):
        model = _make_model()
        img = Image.new("RGB", (4096, 2160))
        result = model._to_pil(img)
        assert result.size == (4096, 2160)

    def test_odd_dimensions(self):
        model = _make_model()
        img = Image.new("RGB", (511, 513))
        result = model._to_pil(img)
        assert result.size == (511, 513)

    def test_extreme_aspect_ratio(self):
        model = _make_model()
        img = Image.new("RGB", (1000, 10))
        result = model._to_pil(img)
        assert result.size == (1000, 10)


# ===================================================================
# Depth output processor (12 tests)
# ===================================================================

class TestDepthOutput:
    """Test depth heatmap output path."""

    def test_returns_heatmap(self):
        model = _make_model("depth")
        _patch_infer(model, _mock_pred())
        with _patch_load_images():
            result = model._predict_all([Image.new("RGB", (64, 64))])
        assert isinstance(result[0], fol.Heatmap)

    def test_heatmap_shape_518(self):
        model = _make_model("depth")
        _patch_infer(model, _mock_pred(518, 518))
        with _patch_load_images():
            result = model._predict_all([Image.new("RGB", (64, 64))])
        assert result[0].map.shape == (518, 518)

    def test_heatmap_shape_392(self):
        model = _make_model("depth")
        _patch_infer(model, _mock_pred(392, 518))
        with _patch_load_images():
            result = model._predict_all([Image.new("RGB", (64, 64))])
        assert result[0].map.shape == (392, 518)

    def test_normalized_max_one(self):
        model = _make_model("depth")
        _patch_infer(model, _mock_pred(depth_val=7.3))
        with _patch_load_images():
            result = model._predict_all([Image.new("RGB", (64, 64))])
        assert result[0].map.max() == pytest.approx(1.0)

    def test_normalized_min_geq_zero(self):
        model = _make_model("depth")
        _patch_infer(model, _mock_pred())
        with _patch_load_images():
            result = model._predict_all([Image.new("RGB", (64, 64))])
        assert result[0].map.min() >= 0.0

    def test_zero_depth_no_nan(self):
        model = _make_model("depth")
        _patch_infer(model, _mock_pred(depth_val=0.0))
        with _patch_load_images():
            result = model._predict_all([Image.new("RGB", (64, 64))])
        assert not np.any(np.isnan(result[0].map))

    def test_zero_depth_stays_zero(self):
        model = _make_model("depth")
        _patch_infer(model, _mock_pred(depth_val=0.0))
        with _patch_load_images():
            result = model._predict_all([Image.new("RGB", (64, 64))])
        assert result[0].map.max() == 0.0

    def test_uniform_depth_all_ones(self):
        model = _make_model("depth")
        _patch_infer(model, _mock_pred(depth_val=3.5))
        with _patch_load_images():
            result = model._predict_all([Image.new("RGB", (64, 64))])
        assert np.allclose(result[0].map, 1.0)

    def test_heatmap_dtype_float(self):
        model = _make_model("depth")
        _patch_infer(model, _mock_pred())
        with _patch_load_images():
            result = model._predict_all([Image.new("RGB", (64, 64))])
        assert result[0].map.dtype in (np.float32, np.float64)

    def test_large_depth_range(self):
        model = _make_model("depth")
        pred = _mock_pred()
        pred["depth_z"][0][0, 0, 0] = 0.001
        pred["depth_z"][0][-1, -1, 0] = 1000.0
        _patch_infer(model, pred)
        with _patch_load_images():
            result = model._predict_all([Image.new("RGB", (64, 64))])
        assert result[0].map.max() == pytest.approx(1.0)
        assert result[0].map.min() >= 0.0

    def test_small_depth_values(self):
        model = _make_model("depth")
        _patch_infer(model, _mock_pred(depth_val=1e-7))
        with _patch_load_images():
            result = model._predict_all([Image.new("RGB", (64, 64))])
        assert not np.any(np.isnan(result[0].map))
        assert not np.any(np.isinf(result[0].map))

    def test_heatmap_has_no_map_path(self):
        model = _make_model("depth")
        _patch_infer(model, _mock_pred())
        with _patch_load_images():
            result = model._predict_all([Image.new("RGB", (64, 64))])
        assert result[0].map_path is None


# ===================================================================
# Pointcloud output processor (12 tests)
# ===================================================================

class TestPointcloudOutput:
    """Test pointcloud output path."""

    def _run_pointcloud(self, mask_tensor=None, valid_tensor=None, h=518, w=518):
        model = _make_model("pointcloud")
        pred = _mock_pred(h, w)
        if mask_tensor is not None:
            pred["mask"] = [mask_tensor]
        pts3d = torch.rand(h, w, 3)
        valid = valid_tensor if valid_tensor is not None else torch.ones(h, w, dtype=torch.bool)
        _patch_infer(model, pred)
        with _patch_load_images(), _patch_depthmap_to_world(pts3d, valid):
            result = model._predict_all([Image.new("RGB", (64, 64))])
        return result, pts3d, valid

    def test_returns_classification(self):
        result, _, _ = self._run_pointcloud()
        assert isinstance(result[0], fol.Classification)

    def test_label_value(self):
        result, _, _ = self._run_pointcloud()
        assert result[0].label == "3d_pointcloud"

    def test_has_points3d(self):
        result, _, _ = self._run_pointcloud()
        assert hasattr(result[0], "points3d")

    def test_points3d_is_list(self):
        result, _, _ = self._run_pointcloud()
        assert isinstance(result[0].points3d, list)

    def test_points3d_shape(self):
        result, _, _ = self._run_pointcloud()
        pts = result[0].points3d
        assert len(pts) > 0
        assert len(pts[0]) == 3

    def test_full_mask_all_points(self):
        """All pixels valid → all 518*518 points present."""
        result, _, _ = self._run_pointcloud()
        assert len(result[0].points3d) == 518 * 518

    def test_partial_mask(self):
        """Half of mask false → roughly half the points."""
        h, w = 518, 518
        mask = torch.ones(h, w, 1)
        mask[:h // 2, :, :] = 0
        result, _, _ = self._run_pointcloud(mask_tensor=mask)
        assert len(result[0].points3d) < h * w

    def test_empty_mask(self):
        """All-zero mask → no points."""
        h, w = 518, 518
        mask = torch.zeros(h, w, 1)
        result, _, _ = self._run_pointcloud(mask_tensor=mask)
        assert len(result[0].points3d) == 0

    def test_invalid_depth_excluded(self):
        """Invalid depth pixels filtered by valid mask."""
        h, w = 100, 100
        valid = torch.ones(h, w, dtype=torch.bool)
        valid[:50, :] = False
        result, _, _ = self._run_pointcloud(valid_tensor=valid, h=h, w=w)
        assert len(result[0].points3d) == 50 * 100

    def test_combined_mask_and_valid(self):
        """Both model mask and depth validity filter jointly."""
        h, w = 100, 100
        mask = torch.ones(h, w, 1)
        mask[:25, :, :] = 0
        valid = torch.ones(h, w, dtype=torch.bool)
        valid[75:, :] = False
        result, _, _ = self._run_pointcloud(
            mask_tensor=mask, valid_tensor=valid, h=h, w=w,
        )
        assert len(result[0].points3d) == 50 * 100

    def test_pointcloud_coordinates_finite(self):
        result, _, _ = self._run_pointcloud()
        for pt in result[0].points3d[:100]:
            assert all(np.isfinite(v) for v in pt)

    def test_different_spatial_size(self):
        result, _, _ = self._run_pointcloud(h=392, w=518)
        assert isinstance(result[0], fol.Classification)


# ===================================================================
# Inference — _predict_all control flow (14 tests)
# ===================================================================

class TestPredictAll:
    """Test _predict_all orchestration logic."""

    def test_empty_list(self):
        model = _make_model()
        assert model._predict_all([]) == []

    def test_single_image_list(self):
        model = _make_model("depth")
        _patch_infer(model, _mock_pred())
        with _patch_load_images():
            result = model._predict_all([Image.new("RGB", (64, 64))])
        assert len(result) == 1

    def test_single_image_non_list(self):
        model = _make_model("depth")
        _patch_infer(model, _mock_pred())
        with _patch_load_images():
            result = model._predict_all(Image.new("RGB", (64, 64)))
        assert len(result) == 1

    def test_two_images(self):
        model = _make_model("depth")
        _patch_infer(model, _mock_pred())
        imgs = [Image.new("RGB", (64, 64)), Image.new("RGB", (64, 64))]
        with _patch_load_images():
            result = model._predict_all(imgs)
        assert len(result) == 2

    def test_five_images(self):
        model = _make_model("depth")
        _patch_infer(model, _mock_pred())
        imgs = [Image.new("RGB", (64, 64)) for _ in range(5)]
        with _patch_load_images():
            result = model._predict_all(imgs)
        assert len(result) == 5

    def test_eight_images_batch(self):
        model = _make_model("depth")
        _patch_infer(model, _mock_pred())
        imgs = [Image.new("RGB", (64, 64)) for _ in range(8)]
        with _patch_load_images():
            result = model._predict_all(imgs)
        assert len(result) == 8

    def test_invalid_output_type_raises(self):
        model = _make_model("invalid")
        _patch_infer(model, _mock_pred())
        with _patch_load_images():
            with pytest.raises(ValueError, match="output_type"):
                model._predict_all([Image.new("RGB", (64, 64))])

    def test_infer_called_per_image(self):
        model = _make_model("depth")
        _patch_infer(model, _mock_pred())
        imgs = [Image.new("RGB", (64, 64)) for _ in range(3)]
        with _patch_load_images():
            model._predict_all(imgs)
        assert model._model.infer.call_count == 3

    def test_infer_called_with_amp(self):
        model = _make_model("depth")
        model._use_amp = True
        model._amp_dtype = "fp16"
        _patch_infer(model, _mock_pred())
        with _patch_load_images():
            model._predict_all([Image.new("RGB", (64, 64))])
        call_kwargs = model._model.infer.call_args[1]
        assert call_kwargs["use_amp"] is True
        assert call_kwargs["amp_dtype"] == "fp16"

    def test_infer_called_without_amp(self):
        model = _make_model("depth")
        model._use_amp = False
        model._amp_dtype = "fp32"
        _patch_infer(model, _mock_pred())
        with _patch_load_images():
            model._predict_all([Image.new("RGB", (64, 64))])
        call_kwargs = model._model.infer.call_args[1]
        assert call_kwargs["use_amp"] is False
        assert call_kwargs["amp_dtype"] == "fp32"

    def test_infer_memory_efficient_flag(self):
        model = _make_model("depth")
        _patch_infer(model, _mock_pred())
        with _patch_load_images():
            model._predict_all([Image.new("RGB", (64, 64))])
        call_kwargs = model._model.infer.call_args[1]
        assert call_kwargs["memory_efficient_inference"] is True

    def test_infer_minibatch_size_one(self):
        model = _make_model("depth")
        _patch_infer(model, _mock_pred())
        with _patch_load_images():
            model._predict_all([Image.new("RGB", (64, 64))])
        call_kwargs = model._model.infer.call_args[1]
        assert call_kwargs["minibatch_size"] == 1

    def test_infer_mask_edges_enabled(self):
        model = _make_model("depth")
        _patch_infer(model, _mock_pred())
        with _patch_load_images():
            model._predict_all([Image.new("RGB", (64, 64))])
        call_kwargs = model._model.infer.call_args[1]
        assert call_kwargs["apply_mask"] is True
        assert call_kwargs["mask_edges"] is True

    def test_temp_file_cleaned_up(self):
        model = _make_model("depth")
        _patch_infer(model, _mock_pred())
        created_files = []
        original_load = None

        def capture_and_load(paths):
            created_files.extend(paths)
            return [{"img": torch.rand(1, 3, 518, 518)}]

        with patch(
            "fiftyone.utils.mapanything.mapanything_image.load_images",
            side_effect=capture_and_load,
        ):
            model._predict_all([Image.new("RGB", (64, 64))])

        for f in created_files:
            assert not os.path.exists(f), f"Temp file not cleaned up: {f}"


# ===================================================================
# Input image variations (10 tests)
# ===================================================================

class TestInputVariations:
    """Test _predict_all with varied input types and sizes."""

    def _run(self, img):
        model = _make_model("depth")
        _patch_infer(model, _mock_pred())
        with _patch_load_images():
            return model._predict_all([img])

    def test_pil_rgb(self):
        result = self._run(Image.new("RGB", (640, 480)))
        assert isinstance(result[0], fol.Heatmap)

    def test_pil_rgba(self):
        result = self._run(Image.new("RGBA", (640, 480)))
        assert isinstance(result[0], fol.Heatmap)

    def test_pil_grayscale(self):
        result = self._run(Image.new("L", (640, 480)))
        assert isinstance(result[0], fol.Heatmap)

    def test_numpy_uint8(self):
        arr = np.random.randint(0, 255, (480, 640, 3), dtype=np.uint8)
        result = self._run(arr)
        assert isinstance(result[0], fol.Heatmap)

    def test_filepath(self, tmp_path):
        p = str(tmp_path / "img.png")
        Image.new("RGB", (100, 100)).save(p)
        result = self._run(p)
        assert isinstance(result[0], fol.Heatmap)

    def test_small_32px(self):
        result = self._run(Image.new("RGB", (32, 32)))
        assert isinstance(result[0], fol.Heatmap)

    def test_large_4k(self):
        result = self._run(Image.new("RGB", (3840, 2160)))
        assert isinstance(result[0], fol.Heatmap)

    def test_portrait(self):
        result = self._run(Image.new("RGB", (480, 640)))
        assert isinstance(result[0], fol.Heatmap)

    def test_extreme_landscape(self):
        result = self._run(Image.new("RGB", (1000, 100)))
        assert isinstance(result[0], fol.Heatmap)

    def test_extreme_portrait(self):
        result = self._run(Image.new("RGB", (100, 1000)))
        assert isinstance(result[0], fol.Heatmap)


# ===================================================================
# Determinism and consistency (6 tests)
# ===================================================================

class TestDeterminism:
    """Test that same input produces same output."""

    def test_same_image_same_depth(self):
        model = _make_model("depth")
        pred = _mock_pred()
        _patch_infer(model, pred)
        img = Image.new("RGB", (64, 64), color=(128, 128, 128))
        with _patch_load_images():
            r1 = model._predict_all([img])
            r2 = model._predict_all([img])
        np.testing.assert_array_equal(r1[0].map, r2[0].map)

    def test_same_image_same_pointcloud(self):
        model = _make_model("pointcloud")
        pred = _mock_pred()
        pts3d = torch.rand(518, 518, 3)
        valid = torch.ones(518, 518, dtype=torch.bool)
        _patch_infer(model, pred)
        img = Image.new("RGB", (64, 64), color=(128, 128, 128))
        with _patch_load_images(), _patch_depthmap_to_world(pts3d, valid):
            r1 = model._predict_all([img])
            r2 = model._predict_all([img])
        assert r1[0].points3d == r2[0].points3d

    def test_different_images_may_differ(self):
        """Different depth predictions produce different heatmaps."""
        model = _make_model("depth")
        model._model = MagicMock()
        pred_a = _mock_pred(depth_val=1.0)
        pred_b = _mock_pred(depth_val=5.0)
        pred_b["depth_z"][0][0, 0, 0] = 10.0
        model._model.infer = MagicMock(side_effect=[[pred_a], [pred_b]])
        imgs = [Image.new("RGB", (64, 64)), Image.new("RGB", (64, 64))]
        with _patch_load_images():
            result = model._predict_all(imgs)
        assert not np.array_equal(result[0].map, result[1].map)

    def test_depth_output_count_matches_input(self):
        model = _make_model("depth")
        _patch_infer(model, _mock_pred())
        imgs = [Image.new("RGB", (64, 64)) for _ in range(7)]
        with _patch_load_images():
            result = model._predict_all(imgs)
        assert len(result) == 7

    def test_pointcloud_output_count_matches_input(self):
        model = _make_model("pointcloud")
        _patch_infer(model, _mock_pred())
        pts3d = torch.rand(518, 518, 3)
        valid = torch.ones(518, 518, dtype=torch.bool)
        imgs = [Image.new("RGB", (64, 64)) for _ in range(4)]
        with _patch_load_images(), _patch_depthmap_to_world(pts3d, valid):
            result = model._predict_all(imgs)
        assert len(result) == 4

    def test_all_outputs_same_type_depth(self):
        model = _make_model("depth")
        _patch_infer(model, _mock_pred())
        imgs = [Image.new("RGB", (64, 64)) for _ in range(3)]
        with _patch_load_images():
            result = model._predict_all(imgs)
        for r in result:
            assert isinstance(r, fol.Heatmap)


# ===================================================================
# Model properties (4 tests)
# ===================================================================

class TestModelProperties:
    """Test model attribute accessors."""

    def test_media_type(self):
        model = _make_model()
        assert model.media_type == "image"

    def test_output_type_stored(self):
        model = _make_model("pointcloud")
        assert model._output_type == "pointcloud"

    def test_use_amp_stored(self):
        model = _make_model()
        model._use_amp = False
        assert model._use_amp is False

    def test_amp_dtype_stored(self):
        model = _make_model()
        model._amp_dtype = "fp16"
        assert model._amp_dtype == "fp16"


# ===================================================================
# Manifest entry (6 tests)
# ===================================================================

class TestManifestEntry:
    """Test the manifest-torch.json entry is well-formed."""

    @pytest.fixture(scope="class")
    def manifest(self):
        import json
        manifest_path = os.path.join(
            os.path.dirname(os.path.dirname(os.path.dirname(
                os.path.dirname(os.path.abspath(__file__))
            ))),
            "fiftyone", "zoo", "models", "manifest-torch.json",
        )
        with open(manifest_path, "r") as f:
            data = json.load(f)
        entries = {m["base_name"]: m for m in data["models"]}
        return entries.get("map-anything-apache-torch")

    def test_entry_exists(self, manifest):
        assert manifest is not None

    def test_license(self, manifest):
        assert manifest["license"] == "Apache 2.0"

    def test_source_url(self, manifest):
        assert "huggingface.co" in manifest["source"]
        assert "map-anything-apache" in manifest["source"]

    def test_type_path(self, manifest):
        assert manifest["default_deployment_config_dict"]["type"] == \
            "fiftyone.utils.mapanything.MapAnythingModel"

    def test_tags_contain_3d(self, manifest):
        assert "3d" in manifest["tags"]
        assert "depth" in manifest["tags"]
        assert "torch" in manifest["tags"]

    def test_size_bytes_reasonable(self, manifest):
        assert manifest["size_bytes"] > 1_000_000_000
        assert manifest["size_bytes"] < 10_000_000_000


# ===================================================================
# Batch processing (12 tests)
# ===================================================================

class TestBatchProcessing:
    """Test batch inference behavior."""

    def test_batch_1(self):
        model = _make_model("depth")
        _patch_infer(model, _mock_pred())
        with _patch_load_images():
            result = model._predict_all([Image.new("RGB", (64, 64))])
        assert len(result) == 1

    def test_batch_2(self):
        model = _make_model("depth")
        _patch_infer(model, _mock_pred())
        imgs = [Image.new("RGB", (64, 64)) for _ in range(2)]
        with _patch_load_images():
            result = model._predict_all(imgs)
        assert len(result) == 2

    def test_batch_4(self):
        model = _make_model("depth")
        _patch_infer(model, _mock_pred())
        imgs = [Image.new("RGB", (64, 64)) for _ in range(4)]
        with _patch_load_images():
            result = model._predict_all(imgs)
        assert len(result) == 4

    def test_batch_16(self):
        model = _make_model("depth")
        _patch_infer(model, _mock_pred())
        imgs = [Image.new("RGB", (64, 64)) for _ in range(16)]
        with _patch_load_images():
            result = model._predict_all(imgs)
        assert len(result) == 16

    def test_batch_vs_individual_depth(self):
        """Batch of 3 produces same results as 3 individual calls."""
        pred = _mock_pred(depth_val=2.5)
        img = Image.new("RGB", (64, 64), color=(100, 100, 100))

        model_batch = _make_model("depth")
        _patch_infer(model_batch, pred)
        with _patch_load_images():
            batch_result = model_batch._predict_all([img, img, img])

        model_single = _make_model("depth")
        _patch_infer(model_single, pred)
        with _patch_load_images():
            single_results = [
                model_single._predict_all([img])[0] for _ in range(3)
            ]

        for b, s in zip(batch_result, single_results):
            np.testing.assert_array_equal(b.map, s.map)

    def test_batch_vs_individual_pointcloud(self):
        """Batch of 2 produces same results as 2 individual calls."""
        pred = _mock_pred()
        pts3d = torch.rand(518, 518, 3)
        valid = torch.ones(518, 518, dtype=torch.bool)
        img = Image.new("RGB", (64, 64), color=(50, 50, 50))

        model_batch = _make_model("pointcloud")
        _patch_infer(model_batch, pred)
        with _patch_load_images(), _patch_depthmap_to_world(pts3d, valid):
            batch_result = model_batch._predict_all([img, img])

        model_single = _make_model("pointcloud")
        _patch_infer(model_single, pred)
        with _patch_load_images(), _patch_depthmap_to_world(pts3d, valid):
            single_results = [
                model_single._predict_all([img])[0] for _ in range(2)
            ]

        for b, s in zip(batch_result, single_results):
            assert b.points3d == s.points3d

    def test_mixed_input_types_in_batch(self, tmp_path):
        """Batch with PIL, numpy, and filepath all produce Heatmaps."""
        model = _make_model("depth")
        _patch_infer(model, _mock_pred())

        p = str(tmp_path / "img.png")
        Image.new("RGB", (64, 64)).save(p)

        imgs = [
            Image.new("RGB", (640, 480)),
            np.random.randint(0, 255, (480, 640, 3), dtype=np.uint8),
            p,
        ]

        with _patch_load_images():
            result = model._predict_all(imgs)

        assert len(result) == 3
        for r in result:
            assert isinstance(r, fol.Heatmap)

    def test_mixed_sizes_in_batch(self):
        """Batch with different image sizes all succeed."""
        model = _make_model("depth")
        _patch_infer(model, _mock_pred())

        imgs = [
            Image.new("RGB", (32, 32)),
            Image.new("RGB", (640, 480)),
            Image.new("RGB", (1920, 1080)),
            Image.new("RGB", (100, 1000)),
        ]

        with _patch_load_images():
            result = model._predict_all(imgs)

        assert len(result) == 4
        for r in result:
            assert isinstance(r, fol.Heatmap)

    def test_mixed_color_modes_in_batch(self):
        """Batch with RGB, RGBA, grayscale all succeed."""
        model = _make_model("depth")
        _patch_infer(model, _mock_pred())

        imgs = [
            Image.new("RGB", (64, 64)),
            Image.new("RGBA", (64, 64)),
            Image.new("L", (64, 64)),
            Image.new("CMYK", (64, 64)),
        ]

        with _patch_load_images():
            result = model._predict_all(imgs)

        assert len(result) == 4
        for r in result:
            assert isinstance(r, fol.Heatmap)

    def test_each_batch_item_independent(self):
        """Each image in batch gets its own infer call."""
        model = _make_model("depth")
        preds = [
            _mock_pred(depth_val=1.0),
            _mock_pred(depth_val=5.0),
            _mock_pred(depth_val=10.0),
        ]
        model._model = MagicMock()
        model._model.infer = MagicMock(
            side_effect=[[p] for p in preds]
        )

        imgs = [Image.new("RGB", (64, 64)) for _ in range(3)]
        with _patch_load_images():
            result = model._predict_all(imgs)

        assert len(result) == 3
        assert model._model.infer.call_count == 3
        # Each should be normalized to 1.0 individually
        for r in result:
            assert np.allclose(r.map, 1.0)

    def test_batch_pointcloud_mixed_masks(self):
        """Batch where different images have different mask densities."""
        model = _make_model("pointcloud")

        h, w = 100, 100
        pred_full = _mock_pred(h, w)
        pred_half = _mock_pred(h, w)
        pred_half["mask"] = [torch.cat([
            torch.ones(h // 2, w, 1),
            torch.zeros(h // 2, w, 1),
        ], dim=0)]

        pts3d = torch.rand(h, w, 3)
        valid = torch.ones(h, w, dtype=torch.bool)

        model._model = MagicMock()
        model._model.infer = MagicMock(
            side_effect=[[pred_full], [pred_half]]
        )

        imgs = [Image.new("RGB", (64, 64)), Image.new("RGB", (64, 64))]
        with _patch_load_images(), _patch_depthmap_to_world(pts3d, valid):
            result = model._predict_all(imgs)

        assert len(result[0].points3d) == h * w
        assert len(result[1].points3d) == (h // 2) * w

    def test_batch_depth_different_predictions(self):
        """Batch where model returns different depths per image."""
        model = _make_model("depth")

        pred_shallow = _mock_pred(depth_val=1.0)
        pred_shallow["depth_z"][0][0, 0, 0] = 2.0

        pred_deep = _mock_pred(depth_val=10.0)
        pred_deep["depth_z"][0][0, 0, 0] = 20.0

        model._model = MagicMock()
        model._model.infer = MagicMock(
            side_effect=[[pred_shallow], [pred_deep]]
        )

        imgs = [Image.new("RGB", (64, 64)), Image.new("RGB", (64, 64))]
        with _patch_load_images():
            result = model._predict_all(imgs)

        assert len(result) == 2
        assert not np.array_equal(result[0].map, result[1].map)
        # Both should be normalized to max 1.0
        assert result[0].map.max() == pytest.approx(1.0)
        assert result[1].map.max() == pytest.approx(1.0)


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
