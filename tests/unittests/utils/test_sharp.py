"""
Tests for fiftyone/utils/sharp.py Apple SHARP model wrapper.

| Copyright 2017-2026, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""

import unittest.mock as _mock

import pytest


@pytest.fixture(autouse=True)
def _stub_lazy_sharp(monkeypatch):
    """Replace the lazy_import sentinels so mock.patch("...sharp_utils.X")
    doesn't trigger _ensure_sharp → pip install (Windows libheif DLL lock).
    _ensure_sharp itself is covered by TestEnsureSharp below.
    """
    import fiftyone.utils.sharp as _fou_sharp

    monkeypatch.setattr(_fou_sharp, "sharp_utils", _mock.MagicMock())
    monkeypatch.setattr(_fou_sharp, "sharp_models", _mock.MagicMock())


class TestAppleSharpModelConfig:
    """Test AppleSharpModelConfig parsing and defaults."""

    def test_default_config(self):
        """Test default configuration values."""
        from fiftyone.utils.sharp import AppleSharpModelConfig

        config = AppleSharpModelConfig({})

        assert config.focal_length_mm == 26.0
        assert config.output_dir is None

    def test_custom_focal_length(self):
        """Test custom focal_length_mm."""
        from fiftyone.utils.sharp import AppleSharpModelConfig

        config = AppleSharpModelConfig({"focal_length_mm": 50.0})

        assert config.focal_length_mm == 50.0

    def test_custom_output_dir(self, tmp_path):
        """Test custom output_dir."""
        from fiftyone.utils.sharp import AppleSharpModelConfig

        custom_dir = str(tmp_path / "sharp_out")
        config = AppleSharpModelConfig({"output_dir": custom_dir})

        assert config.output_dir == custom_dir

    def test_combined_config(self):
        """Test multiple custom values together."""
        from fiftyone.utils.sharp import AppleSharpModelConfig

        config = AppleSharpModelConfig({
            "focal_length_mm": 35.0,
            "output_dir": "/custom/path",
        })

        assert config.focal_length_mm == 35.0
        assert config.output_dir == "/custom/path"


class TestAppleSharpToNumpy:
    """Test AppleSharpModel._to_numpy input conversion."""

    def _make_model(self):
        """Create a minimal model instance for testing _to_numpy."""
        from fiftyone.utils.sharp import AppleSharpModel

        model = AppleSharpModel.__new__(AppleSharpModel)
        return model

    def test_to_numpy_pil_rgb(self):
        """Test PIL RGB image conversion."""
        from PIL import Image
        import numpy as np

        model = self._make_model()
        img = Image.new("RGB", (100, 80), color=(255, 128, 64))
        result = model._to_numpy(img)

        assert isinstance(result, np.ndarray)
        assert result.dtype == np.uint8
        assert result.shape == (80, 100, 3)
        assert result[0, 0, 0] == 255
        assert result[0, 0, 1] == 128
        assert result[0, 0, 2] == 64

    def test_to_numpy_pil_rgba(self):
        """Test PIL RGBA image is converted to RGB."""
        from PIL import Image
        import numpy as np

        model = self._make_model()
        img = Image.new("RGBA", (50, 50), color=(100, 150, 200, 255))
        result = model._to_numpy(img)

        assert isinstance(result, np.ndarray)
        assert result.shape == (50, 50, 3)
        assert result[0, 0, 0] == 100
        assert result[0, 0, 1] == 150
        assert result[0, 0, 2] == 200

    def test_to_numpy_pil_grayscale(self):
        """Test PIL grayscale image is converted to RGB."""
        from PIL import Image
        import numpy as np

        model = self._make_model()
        img = Image.new("L", (30, 30), color=128)
        result = model._to_numpy(img)

        assert isinstance(result, np.ndarray)
        assert result.shape == (30, 30, 3)
        assert result[0, 0, 0] == 128
        assert result[0, 0, 1] == 128
        assert result[0, 0, 2] == 128

    def test_to_numpy_ndarray_rgb_uint8(self):
        """Test uint8 HWC numpy array is handled directly."""
        import numpy as np

        model = self._make_model()
        arr = np.zeros((20, 30, 3), dtype=np.uint8)
        arr[0, 0] = [255, 128, 64]
        result = model._to_numpy(arr)

        assert isinstance(result, np.ndarray)
        assert result.dtype == np.uint8
        assert result.shape == (20, 30, 3)
        assert np.array_equal(result, arr)


class TestAppleSharpIntrinsics:
    """Test focal length and intrinsics calculations."""

    def _make_model(self, focal_length_mm=26.0):
        """Create a minimal model instance for intrinsics tests."""
        import torch
        from fiftyone.utils.sharp import AppleSharpModel

        model = AppleSharpModel.__new__(AppleSharpModel)
        model._focal_length_mm = focal_length_mm
        model._device = torch.device("cpu")
        return model

    def test_focal_length_to_fpx_default(self):
        """Test f_px calculation with default 26mm focal length."""
        model = self._make_model(26.0)
        assert model.focal_length_to_fpx(1920) == pytest.approx(
            1386.67, rel=0.01
        )

    def test_focal_length_to_fpx_50mm(self):
        """Test f_px calculation with 50mm focal length."""
        model = self._make_model(50.0)
        assert model.focal_length_to_fpx(1920) == pytest.approx(
            2666.67, rel=0.01
        )

    def test_disparity_factor_calculation(self):
        """Test disparity factor is f_px / width."""
        model = self._make_model(26.0)
        disparity_factor = model.disparity_factor(1000)
        assert disparity_factor.item() == pytest.approx(0.7222, rel=0.01)

    def test_intrinsics_matrix_shape(self):
        """Test intrinsics matrix is 4x4."""
        model = self._make_model()
        intrinsics = model.compute_intrinsics(1080, 1920, 1000.0)
        assert intrinsics.shape == (4, 4)

    def test_intrinsics_matrix_values(self):
        """Test intrinsics matrix has correct structure."""
        f_px = 1500.0
        width = 1920
        height = 1080
        model = self._make_model()
        intrinsics = model.compute_intrinsics(height, width, f_px)

        assert intrinsics[0, 0] == f_px
        assert intrinsics[1, 1] == f_px
        assert intrinsics[0, 2] == width / 2
        assert intrinsics[1, 2] == height / 2
        assert intrinsics[2, 2] == 1.0
        assert intrinsics[3, 3] == 1.0

    def test_intrinsics_resized_scaling(self):
        """Test intrinsics scaling for internal_shape."""
        f_px = 1000.0
        width = 1920
        height = 1080
        internal_shape = (1536, 1536)
        model = self._make_model()
        intrinsics = model.compute_intrinsics(height, width, f_px)
        intrinsics_resized = model.resize_intrinsics(
            intrinsics, internal_shape, height, width
        )

        assert intrinsics_resized[0, 0] == pytest.approx(f_px * 1536 / 1920)
        assert intrinsics_resized[1, 1] == pytest.approx(f_px * 1536 / 1080)


class TestAppleSharpOutputDir:
    """Test output directory initialization."""

    def _make_model(self, output_dir=None):
        """Create a minimal model instance for testing."""
        from fiftyone.utils.sharp import AppleSharpModel

        model = AppleSharpModel.__new__(AppleSharpModel)
        model._output_dir = output_dir
        model._output_dir_initialized = False
        return model

    def test_ensure_output_dir_creates_temp(self):
        """Test temp directory is created when output_dir is None."""
        import os

        model = self._make_model(output_dir=None)

        model._ensure_output_dir()

        assert model._output_dir is not None
        assert os.path.isdir(model._output_dir)
        assert model._output_dir_initialized is True

    def test_ensure_output_dir_uses_provided(self, tmp_path):
        """Test provided output_dir is used."""
        import os

        custom_dir = str(tmp_path / "custom_sharp")
        model = self._make_model(output_dir=custom_dir)

        model._ensure_output_dir()

        assert model._output_dir == custom_dir
        assert os.path.isdir(custom_dir)
        assert model._output_dir_initialized is True

    def test_ensure_output_dir_idempotent(self):
        """Test _ensure_output_dir only initializes once."""
        model = self._make_model(output_dir=None)

        model._ensure_output_dir()
        first_dir = model._output_dir

        model._ensure_output_dir()
        second_dir = model._output_dir

        assert first_dir == second_dir


class TestAppleSharpExportGaussians:
    """Test _export_gaussians output format."""

    def _make_model(self, output_dir):
        """Create a minimal model instance for testing."""
        from fiftyone.utils.sharp import AppleSharpModel

        model = AppleSharpModel.__new__(AppleSharpModel)
        model._output_dir = output_dir
        model._output_dir_initialized = True
        return model

    def test_export_returns_classification(self, tmp_path):
        """Test _export_gaussians returns a Classification."""
        from unittest.mock import patch
        import fiftyone.core.labels as fol

        with patch("fiftyone.utils.sharp.sharp_utils.save_ply"), \
                 patch("fiftyone.utils.sharp.AppleSharpModel._splat_to_pointcloud"), \
                 patch("fiftyone.utils.sharp.fo3d.Scene.write"):
            model = self._make_model(str(tmp_path))
            result = model._export_gaussians(None, 1000.0, 1080, 1920)

        assert isinstance(result, fol.Classification)

    def test_export_has_splat_path(self, tmp_path):
        """Test result has splat_path attribute."""
        from unittest.mock import patch

        with patch("fiftyone.utils.sharp.sharp_utils.save_ply"), \
                 patch("fiftyone.utils.sharp.AppleSharpModel._splat_to_pointcloud"), \
                 patch("fiftyone.utils.sharp.fo3d.Scene.write"):
            model = self._make_model(str(tmp_path))
            result = model._export_gaussians(None, 1000.0, 1080, 1920)

        assert hasattr(result, "splat_path")
        assert result.splat_path is not None
        assert result.splat_path.endswith(".ply")

    def test_export_label_value(self, tmp_path):
        """Test label is '3d_gaussians'."""
        from unittest.mock import patch

        with patch("fiftyone.utils.sharp.sharp_utils.save_ply"), \
                 patch("fiftyone.utils.sharp.AppleSharpModel._splat_to_pointcloud"), \
                 patch("fiftyone.utils.sharp.fo3d.Scene.write"):
            model = self._make_model(str(tmp_path))
            result = model._export_gaussians(None, 1000.0, 1080, 1920)

        assert result.label == "3d_gaussians"

    def test_export_unique_filenames(self, tmp_path):
        """Test multiple exports produce unique paths."""
        from unittest.mock import patch

        with patch("fiftyone.utils.sharp.sharp_utils.save_ply"), \
                 patch("fiftyone.utils.sharp.AppleSharpModel._splat_to_pointcloud"), \
                 patch("fiftyone.utils.sharp.fo3d.Scene.write"):
            model = self._make_model(str(tmp_path))
            result1 = model._export_gaussians(None, 1000.0, 1080, 1920)
            result2 = model._export_gaussians(None, 1000.0, 1080, 1920)

        assert result1.splat_path != result2.splat_path

    def test_export_path_in_output_dir(self, tmp_path):
        """Test splat file is created in output_dir."""
        from unittest.mock import patch
        import os

        output_dir = str(tmp_path / "splats")
        os.makedirs(output_dir)

        with patch("fiftyone.utils.sharp.sharp_utils.save_ply"), \
                 patch("fiftyone.utils.sharp.AppleSharpModel._splat_to_pointcloud"), \
                 patch("fiftyone.utils.sharp.fo3d.Scene.write"):
            model = self._make_model(output_dir)
            result = model._export_gaussians(None, 1000.0, 1080, 1920)

        assert result.splat_path.startswith(output_dir)


class TestAppleSharpPredictAll:
    """Test _predict_all inference handling."""

    def _make_model(self, output_dir):
        """Create a minimal model instance with mocked internals."""
        import torch
        from fiftyone.utils.sharp import AppleSharpModel

        model = AppleSharpModel.__new__(AppleSharpModel)
        model._output_dir = output_dir
        model._output_dir_initialized = True
        model._focal_length_mm = 26.0
        model._device = torch.device("cpu")
        return model

    def test_predict_all_empty_list(self, tmp_path):
        """Test empty input returns empty list."""
        model = self._make_model(str(tmp_path))
        model._model = None

        result = model._predict_all([])

        assert result == []

    def test_predict_all_single_image(self, tmp_path):
        """Test single image returns list of one."""
        from unittest.mock import patch, MagicMock
        from PIL import Image
        import torch
        import fiftyone.core.labels as fol

        model = self._make_model(str(tmp_path))
        model._model = MagicMock(return_value=torch.zeros(1, 100, 14))

        img = Image.new("RGB", (640, 480), color=(128, 128, 128))

        with patch("fiftyone.utils.sharp.sharp_utils.save_ply"), \
                 patch("fiftyone.utils.sharp.AppleSharpModel._splat_to_pointcloud"), \
                 patch("fiftyone.utils.sharp.fo3d.Scene.write"):
            with patch("fiftyone.utils.sharp.sharp_utils.unproject_gaussians",
                       return_value=torch.zeros(100, 14)):
                result = model._predict_all(img)

        assert len(result) == 1
        assert isinstance(result[0], fol.Classification)

    def test_predict_all_multiple_images(self, tmp_path):
        """Test multiple images return matching length."""
        from unittest.mock import patch, MagicMock
        from PIL import Image
        import torch
        import fiftyone.core.labels as fol

        model = self._make_model(str(tmp_path))
        model._model = MagicMock(return_value=torch.zeros(1, 100, 14))

        imgs = [
            Image.new("RGB", (640, 480), color=(255, 0, 0)),
            Image.new("RGB", (800, 600), color=(0, 255, 0)),
            Image.new("RGB", (1024, 768), color=(0, 0, 255)),
        ]

        with patch("fiftyone.utils.sharp.sharp_utils.save_ply"), \
                 patch("fiftyone.utils.sharp.AppleSharpModel._splat_to_pointcloud"), \
                 patch("fiftyone.utils.sharp.fo3d.Scene.write"):
            with patch("fiftyone.utils.sharp.sharp_utils.unproject_gaussians",
                       return_value=torch.zeros(100, 14)):
                result = model._predict_all(imgs)

        assert len(result) == 3
        for r in result:
            assert isinstance(r, fol.Classification)

    def test_predict_all_batched_tensor(self, tmp_path):
        """Test NCHW tensor input is split into per-image predictions."""
        from unittest.mock import patch, MagicMock
        import torch

        model = self._make_model(str(tmp_path))
        model._model = MagicMock(return_value=torch.zeros(1, 100, 14))
        imgs = torch.randint(0, 255, (2, 3, 480, 640), dtype=torch.uint8)

        with patch("fiftyone.utils.sharp.sharp_utils.save_ply"), \
                 patch("fiftyone.utils.sharp.AppleSharpModel._splat_to_pointcloud"), \
                 patch("fiftyone.utils.sharp.fo3d.Scene.write"):
            with patch(
                "fiftyone.utils.sharp.sharp_utils.unproject_gaussians",
                return_value=torch.zeros(100, 14),
            ):
                result = model._predict_all(imgs)

        assert len(result) == 2

    def test_predict_all_batched_ndarray(self, tmp_path):
        """Test NHWC ndarray input is split into per-image predictions."""
        from unittest.mock import patch, MagicMock
        import numpy as np
        import torch

        model = self._make_model(str(tmp_path))
        model._model = MagicMock(return_value=torch.zeros(1, 100, 14))
        imgs = np.random.randint(0, 255, (2, 480, 640, 3), dtype=np.uint8)

        with patch("fiftyone.utils.sharp.sharp_utils.save_ply"), \
                 patch("fiftyone.utils.sharp.AppleSharpModel._splat_to_pointcloud"), \
                 patch("fiftyone.utils.sharp.fo3d.Scene.write"):
            with patch(
                "fiftyone.utils.sharp.sharp_utils.unproject_gaussians",
                return_value=torch.zeros(100, 14),
            ):
                result = model._predict_all(imgs)

        assert len(result) == 2

    def test_predict_all_output_type(self, tmp_path):
        """Test each output element is a Classification with splat_path."""
        from unittest.mock import patch, MagicMock
        from PIL import Image
        import torch
        import fiftyone.core.labels as fol

        model = self._make_model(str(tmp_path))
        model._model = MagicMock(return_value=torch.zeros(1, 100, 14))

        img = Image.new("RGB", (640, 480), color=(100, 100, 100))

        with patch("fiftyone.utils.sharp.sharp_utils.save_ply"), \
                 patch("fiftyone.utils.sharp.AppleSharpModel._splat_to_pointcloud"), \
                 patch("fiftyone.utils.sharp.fo3d.Scene.write"):
            with patch("fiftyone.utils.sharp.sharp_utils.unproject_gaussians",
                       return_value=torch.zeros(100, 14)):
                result = model._predict_all([img])

        assert isinstance(result[0], fol.Classification)
        assert result[0].label == "3d_gaussians"
        assert hasattr(result[0], "splat_path")


class TestEnsureSharp:
    """Verify _ensure_sharp wires fou.{ensure,install}_package correctly."""

    def test_installs_when_missing(self):
        from fiftyone.utils.sharp import _ensure_sharp, _SHARP_REQ

        with _mock.patch("fiftyone.utils.sharp.fou.ensure_package",
                         return_value=False) as ep, \
             _mock.patch("fiftyone.utils.sharp.fou.install_package") as ip:
            _ensure_sharp()

        ep.assert_called_once_with(_SHARP_REQ, error_level=2)
        ip.assert_called_once_with(_SHARP_REQ)

    def test_skips_when_already_installed(self):
        from fiftyone.utils.sharp import _ensure_sharp, _SHARP_REQ

        with _mock.patch("fiftyone.utils.sharp.fou.ensure_package",
                         return_value=True) as ep, \
             _mock.patch("fiftyone.utils.sharp.fou.install_package") as ip:
            _ensure_sharp()

        ep.assert_called_once_with(_SHARP_REQ, error_level=2)
        ip.assert_not_called()


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
