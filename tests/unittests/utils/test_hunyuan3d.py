"""
Tests for fiftyone/utils/hunyuan3d.py model wrapper.

| Copyright 2017-2026, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""

import os
import shutil
import tempfile
from types import SimpleNamespace
from unittest import mock

import numpy as np
import pytest
from PIL import Image

import fiftyone.core.labels as fol


class TestHunyuan3DModelConfig:
    def test_default_config(self):
        from fiftyone.utils.hunyuan3d import Hunyuan3DModelConfig

        config = Hunyuan3DModelConfig({})

        assert config.name_or_path == "tencent/Hunyuan3D-2"
        assert config.output_dir is None
        assert config.output_format == "obj"
        assert config.is_v21 is False
        assert config.raw_inputs is True

    def test_custom_config(self):
        from fiftyone.utils.hunyuan3d import Hunyuan3DModelConfig

        config = Hunyuan3DModelConfig(
            {
                "name_or_path": "custom/model",
                "output_dir": "/tmp/meshes",
                "output_format": "glb",
            }
        )

        assert config.name_or_path == "custom/model"
        assert config.output_dir == "/tmp/meshes"
        assert config.output_format == "glb"
        assert config.is_v21 is False

    def test_is_v21_set_for_official_v21(self):
        from fiftyone.utils.hunyuan3d import Hunyuan3DModelConfig

        config = Hunyuan3DModelConfig({"name_or_path": "tencent/Hunyuan3D-2.1"})

        assert config.is_v21 is True

    def test_is_v21_false_for_lookalike_paths(self):
        from fiftyone.utils.hunyuan3d import Hunyuan3DModelConfig

        for path in (
            "tencent/Hunyuan3D-2.10",
            "local/Hunyuan3D-2.1-fork",
            "TENCENT/Hunyuan3D-2.1",
        ):
            config = Hunyuan3DModelConfig({"name_or_path": path})
            assert config.is_v21 is False, path

    def test_unsupported_output_format_raises(self):
        from fiftyone.utils.hunyuan3d import Hunyuan3DModelConfig

        with pytest.raises(ValueError, match="Unsupported output_format"):
            Hunyuan3DModelConfig({"output_format": "xyz"})

    def test_all_supported_output_formats_accepted(self):
        from fiftyone.utils.hunyuan3d import (
            Hunyuan3DModelConfig,
            SUPPORTED_OUTPUT_FORMATS,
        )

        for fmt in SUPPORTED_OUTPUT_FORMATS:
            config = Hunyuan3DModelConfig({"output_format": fmt})
            assert config.output_format == fmt


class TestHunyuan3DLoadModel:
    @staticmethod
    def _bare_model():
        from fiftyone.utils.hunyuan3d import Hunyuan3DModel

        return Hunyuan3DModel.__new__(Hunyuan3DModel)

    def test_load_model_v2_skips_v21_kwargs(self, monkeypatch):
        from fiftyone.utils import hunyuan3d as fuh

        captured = {}

        class _FakePipeline:
            @classmethod
            def from_pretrained(cls, name_or_path, **kwargs):
                captured["name_or_path"] = name_or_path
                captured["kwargs"] = kwargs
                return SimpleNamespace(name="loaded")

        monkeypatch.setattr(
            fuh,
            "hy3dgen_shapegen",
            SimpleNamespace(Hunyuan3DDiTFlowMatchingPipeline=_FakePipeline),
        )

        model = self._bare_model()
        config = SimpleNamespace(
            name_or_path="tencent/Hunyuan3D-2",
            is_v21=False,
        )

        result = model._load_model(config)

        assert captured["name_or_path"] == "tencent/Hunyuan3D-2"
        assert captured["kwargs"] == {}
        assert result.name == "loaded"

    def test_load_model_v21_passes_subfolder_kwargs(self, monkeypatch):
        from fiftyone.utils import hunyuan3d as fuh

        captured = {}

        class _FakePipeline:
            @classmethod
            def from_pretrained(cls, name_or_path, **kwargs):
                captured["name_or_path"] = name_or_path
                captured["kwargs"] = kwargs
                return SimpleNamespace()

        monkeypatch.setattr(
            fuh,
            "hy3dgen_shapegen",
            SimpleNamespace(Hunyuan3DDiTFlowMatchingPipeline=_FakePipeline),
        )

        model = self._bare_model()
        config = SimpleNamespace(
            name_or_path="tencent/Hunyuan3D-2.1",
            is_v21=True,
        )

        model._load_model(config)

        assert captured["kwargs"] == {
            "subfolder": "hunyuan3d-dit-v2-1",
            "use_safetensors": False,
        }


class TestHunyuan3DMediaType:
    def test_media_type_is_image(self):
        from fiftyone.utils.hunyuan3d import Hunyuan3DModel

        model = Hunyuan3DModel.__new__(Hunyuan3DModel)
        assert model.media_type == "image"


class TestHunyuan3DToPil:
    def _create_model(self):
        from fiftyone.utils.hunyuan3d import Hunyuan3DModel

        return Hunyuan3DModel.__new__(Hunyuan3DModel)

    def test_pil_passthrough(self):
        model = self._create_model()
        img = Image.new("RGB", (100, 100), color="red")
        assert model._to_pil(img) is img

    def test_string_passthrough(self):
        model = self._create_model()
        path = "/path/to/image.png"
        assert model._to_pil(path) == path

    def test_numpy_uint8(self):
        model = self._create_model()
        img = np.random.randint(0, 255, (100, 100, 3), dtype=np.uint8)
        result = model._to_pil(img)

        assert isinstance(result, Image.Image)
        assert result.size == (100, 100)

    def test_numpy_float_0_1(self):
        model = self._create_model()
        img = np.random.rand(100, 100, 3).astype(np.float32)
        result = model._to_pil(img)

        assert isinstance(result, Image.Image)
        assert result.size == (100, 100)

    def test_numpy_float_neg1_1(self):
        model = self._create_model()
        img = (np.random.rand(100, 100, 3).astype(np.float32) * 2) - 1
        result = model._to_pil(img)

        assert isinstance(result, Image.Image)
        assert result.size == (100, 100)

    def test_numpy_grayscale(self):
        model = self._create_model()
        img = np.random.randint(0, 255, (100, 100, 1), dtype=np.uint8)
        result = model._to_pil(img)

        assert isinstance(result, Image.Image)
        assert result.size == (100, 100)

    def test_torch_tensor_chw(self):
        torch = pytest.importorskip("torch")
        model = self._create_model()

        img = torch.randint(0, 255, (3, 100, 100), dtype=torch.uint8)
        result = model._to_pil(img)

        assert isinstance(result, Image.Image)
        assert result.size == (100, 100)

    def test_torch_tensor_batch(self):
        torch = pytest.importorskip("torch")
        model = self._create_model()

        img = torch.randint(0, 255, (1, 3, 100, 100), dtype=torch.uint8)
        result = model._to_pil(img)

        assert isinstance(result, Image.Image)
        assert result.size == (100, 100)

    def test_torch_tensor_grayscale(self):
        torch = pytest.importorskip("torch")
        model = self._create_model()

        img = torch.randint(0, 255, (1, 100, 100), dtype=torch.uint8)
        result = model._to_pil(img)

        assert isinstance(result, Image.Image)
        assert result.size == (100, 100)

    def test_torch_tensor_rgba(self):
        torch = pytest.importorskip("torch")
        model = self._create_model()

        img = torch.randint(0, 255, (4, 100, 100), dtype=torch.uint8)
        result = model._to_pil(img)

        assert isinstance(result, Image.Image)
        assert result.size == (100, 100)

    def test_unsupported_type_raises(self):
        model = self._create_model()

        with pytest.raises(TypeError, match="Unsupported image type"):
            model._to_pil([1, 2, 3])


class TestHunyuan3DExportMesh:
    def _create_model(self, output_dir=None, output_format="obj"):
        from fiftyone.utils.hunyuan3d import Hunyuan3DModel

        model = Hunyuan3DModel.__new__(Hunyuan3DModel)
        model._output_dir = output_dir
        model._output_format = output_format
        model._output_dir_initialized = False
        model._owns_output_dir = False
        return model

    def _create_mock_mesh(self, num_vertices=100, num_faces=50):
        class MockMesh:
            def __init__(self, vertices, faces):
                self.vertices = vertices
                self.faces = faces
                self._exported_path = None

            def export(self, path):
                self._exported_path = path
                with open(path, mode="w") as f:
                    f.write("mock mesh data")

        vertices = np.random.rand(num_vertices, 3)
        faces = np.random.randint(0, num_vertices, (num_faces, 3))
        return MockMesh(vertices, faces)

    def test_export_creates_label(self):
        with tempfile.TemporaryDirectory() as tmpdir:
            model = self._create_model(output_dir=tmpdir)
            mesh = self._create_mock_mesh(num_vertices=1000, num_faces=500)

            label = model._export_mesh(mesh)

            assert isinstance(label, fol.Label)
            assert label.label == "3d_mesh"
            assert label.vertices == 1000
            assert label.faces == 500
            assert label.mesh_path.endswith(".obj")
            assert os.path.exists(label.mesh_path)
            assert label.scene_path.endswith(".fo3d")
            assert os.path.exists(label.scene_path)

    def test_export_custom_format(self):
        with tempfile.TemporaryDirectory() as tmpdir:
            model = self._create_model(output_dir=tmpdir, output_format="glb")
            mesh = self._create_mock_mesh()

            label = model._export_mesh(mesh)

            assert label.mesh_path.endswith(".glb")

    def test_export_creates_output_dir(self):
        with tempfile.TemporaryDirectory() as tmpdir:
            output_dir = os.path.join(tmpdir, "nested", "output")
            model = self._create_model(output_dir=output_dir)
            mesh = self._create_mock_mesh()

            label = model._export_mesh(mesh)

            assert os.path.isdir(output_dir)
            assert os.path.exists(label.mesh_path)

    def test_export_unique_filenames(self):
        with tempfile.TemporaryDirectory() as tmpdir:
            model = self._create_model(output_dir=tmpdir)
            mesh1 = self._create_mock_mesh()
            mesh2 = self._create_mock_mesh()

            label1 = model._export_mesh(mesh1)
            label2 = model._export_mesh(mesh2)

            assert label1.mesh_path != label2.mesh_path

    def test_export_uses_full_uuid_hex(self):
        with tempfile.TemporaryDirectory() as tmpdir:
            model = self._create_model(output_dir=tmpdir)
            label = model._export_mesh(self._create_mock_mesh())

            stem = os.path.splitext(os.path.basename(label.mesh_path))[0]
            assert stem.startswith("mesh_")
            mesh_id = stem[len("mesh_"):]
            assert len(mesh_id) == 32, "expected full uuid4 hex (32 chars)"


class TestHunyuan3DEnsureOutputDir:
    def _create_model(self, output_dir=None):
        from fiftyone.utils.hunyuan3d import Hunyuan3DModel

        model = Hunyuan3DModel.__new__(Hunyuan3DModel)
        model._output_dir = output_dir
        model._output_dir_initialized = False
        model._owns_output_dir = False
        return model

    def test_creates_temp_dir_when_none(self):
        model = self._create_model(output_dir=None)
        try:
            model._ensure_output_dir()

            assert model._output_dir is not None
            assert os.path.isdir(model._output_dir)
            assert "hunyuan3d_" in model._output_dir
            assert model._output_dir_initialized is True
            assert model._owns_output_dir is True
        finally:
            if model._output_dir and os.path.isdir(model._output_dir):
                shutil.rmtree(model._output_dir, ignore_errors=True)

    def test_creates_specified_dir(self):
        with tempfile.TemporaryDirectory() as tmpdir:
            output_dir = os.path.join(tmpdir, "my_meshes")
            model = self._create_model(output_dir=output_dir)
            model._ensure_output_dir()

            assert os.path.isdir(output_dir)
            assert model._output_dir_initialized is True
            assert model._owns_output_dir is False

    def test_idempotent(self):
        with tempfile.TemporaryDirectory() as tmpdir:
            model = self._create_model(output_dir=tmpdir)
            model._ensure_output_dir()
            model._output_dir = "/nonexistent/should/not/be/used"
            # Second call must not change anything because already initialized.
            model._ensure_output_dir()
            assert model._output_dir == "/nonexistent/should/not/be/used"


class TestHunyuan3DCleanup:
    def _create_model(self, output_dir, owns):
        from fiftyone.utils.hunyuan3d import Hunyuan3DModel

        model = Hunyuan3DModel.__new__(Hunyuan3DModel)
        model._output_dir = output_dir
        model._output_dir_initialized = True
        model._owns_output_dir = owns
        return model

    def test_cleanup_removes_owned_temp_dir(self):
        tmp = tempfile.mkdtemp(prefix="hunyuan3d_test_")
        model = self._create_model(output_dir=tmp, owns=True)

        model.cleanup()

        assert not os.path.exists(tmp)
        assert model._output_dir_initialized is False
        assert model._owns_output_dir is False

    def test_cleanup_preserves_user_provided_dir(self):
        with tempfile.TemporaryDirectory() as tmpdir:
            model = self._create_model(output_dir=tmpdir, owns=False)

            model.cleanup()

            assert os.path.isdir(tmpdir)


class TestHunyuan3DPredictAll:
    @staticmethod
    def _bare_model():
        from fiftyone.utils.hunyuan3d import Hunyuan3DModel

        return Hunyuan3DModel.__new__(Hunyuan3DModel)

    def test_empty_input_returns_empty_list(self):
        model = self._bare_model()
        assert model._predict_all([]) == []

    def test_single_image_wrapped_in_list(self):
        model = self._bare_model()
        captured = []

        model._to_pil = lambda img: img
        model._model = mock.MagicMock(
            return_value=[SimpleNamespace(vertices=np.zeros((3, 3)), faces=np.zeros((1, 3)))]
        )
        model._export_mesh = lambda mesh: captured.append(mesh) or fol.Classification(
            label="ok"
        )

        out = model._predict_all("single-image.png")

        assert len(out) == 1
        assert len(captured) == 1
        model._model.assert_called_once_with(image="single-image.png")

    def test_happy_path_multi_image(self):
        model = self._bare_model()

        sentinel_classification_a = fol.Classification(label="a")
        sentinel_classification_b = fol.Classification(label="b")
        responses = iter(
            [sentinel_classification_a, sentinel_classification_b]
        )

        model._to_pil = lambda img: img
        model._model = mock.MagicMock(
            side_effect=lambda image: [
                SimpleNamespace(
                    vertices=np.zeros((1, 3)), faces=np.zeros((1, 3))
                )
            ]
        )
        model._export_mesh = lambda mesh: next(responses)

        out = model._predict_all(["a.png", "b.png"])

        assert out == [sentinel_classification_a, sentinel_classification_b]
        assert model._model.call_count == 2

    def test_partial_failure_keeps_other_results(self):
        model = self._bare_model()
        results = [
            fol.Classification(label="ok-0"),
            fol.Classification(label="ok-2"),
        ]
        results_iter = iter(results)

        def fake_pipeline(image):
            if image == "bad.png":
                raise RuntimeError("boom")
            return [
                SimpleNamespace(
                    vertices=np.zeros((1, 3)), faces=np.zeros((1, 3))
                )
            ]

        model._to_pil = lambda img: img
        model._model = mock.MagicMock(side_effect=fake_pipeline)
        model._export_mesh = lambda mesh: next(results_iter)

        out = model._predict_all(["good-0.png", "bad.png", "good-2.png"])

        assert out == [results[0], None, results[1]]

    def test_unexpected_exception_propagates(self):
        # AttributeError / TypeError / etc. are NOT in the catch list — the
        # narrow catch lets programming errors surface instead of swallowing.
        model = self._bare_model()

        def fake_pipeline(image):
            raise AttributeError("missing method")

        model._to_pil = lambda img: img
        model._model = mock.MagicMock(side_effect=fake_pipeline)

        with pytest.raises(AttributeError, match="missing method"):
            model._predict_all(["a.png"])


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
