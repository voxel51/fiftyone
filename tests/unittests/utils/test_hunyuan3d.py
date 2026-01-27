"""
Tests for fiftyone/utils/hunyuan3d.py model wrapper.

| Copyright 2017-2026, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""

import os
import tempfile

import pytest
import numpy as np
from PIL import Image

import fiftyone.core.labels as fol


class TestHunyuan3DModelConfig:
    """Test Hunyuan3DModelConfig"""

    def test_default_config(self):
        """Test default configuration values"""
        from fiftyone.utils.hunyuan3d import Hunyuan3DModelConfig

        config = Hunyuan3DModelConfig({})

        assert config.name_or_path == "tencent/Hunyuan3D-2"
        assert config.output_dir is None
        assert config.output_format == "obj"

    def test_custom_config(self):
        """Test custom configuration values"""
        from fiftyone.utils.hunyuan3d import Hunyuan3DModelConfig

        config = Hunyuan3DModelConfig({
            "name_or_path": "custom/model",
            "output_dir": "/tmp/meshes",
            "output_format": "glb",
        })

        assert config.name_or_path == "custom/model"
        assert config.output_dir == "/tmp/meshes"
        assert config.output_format == "glb"


class TestHunyuan3DToPil:
    """Test _to_pil image conversion"""

    def _create_model(self):
        """Create a model instance without loading the actual model"""
        from fiftyone.utils.hunyuan3d import Hunyuan3DModel

        model = Hunyuan3DModel.__new__(Hunyuan3DModel)
        return model

    def test_pil_passthrough(self):
        """Test PIL images pass through unchanged"""
        model = self._create_model()
        img = Image.new("RGB", (100, 100), color="red")
        result = model._to_pil(img)

        assert result is img

    def test_string_passthrough(self):
        """Test string paths pass through unchanged"""
        model = self._create_model()
        path = "/path/to/image.png"
        result = model._to_pil(path)

        assert result == path

    def test_numpy_uint8(self):
        """Test numpy uint8 array conversion"""
        model = self._create_model()
        img = np.random.randint(0, 255, (100, 100, 3), dtype=np.uint8)
        result = model._to_pil(img)

        assert isinstance(result, Image.Image)
        assert result.size == (100, 100)

    def test_numpy_float_0_1(self):
        """Test numpy float [0, 1] array conversion"""
        model = self._create_model()
        img = np.random.rand(100, 100, 3).astype(np.float32)
        result = model._to_pil(img)

        assert isinstance(result, Image.Image)
        assert result.size == (100, 100)

    def test_numpy_float_neg1_1(self):
        """Test numpy float [-1, 1] array conversion"""
        model = self._create_model()
        img = (np.random.rand(100, 100, 3).astype(np.float32) * 2) - 1
        result = model._to_pil(img)

        assert isinstance(result, Image.Image)
        assert result.size == (100, 100)

    def test_numpy_grayscale(self):
        """Test numpy grayscale array with channel dim"""
        model = self._create_model()
        img = np.random.randint(0, 255, (100, 100, 1), dtype=np.uint8)
        result = model._to_pil(img)

        assert isinstance(result, Image.Image)
        assert result.size == (100, 100)

    def test_torch_tensor_chw(self):
        """Test torch tensor CHW format conversion"""
        torch = pytest.importorskip("torch")
        model = self._create_model()

        img = torch.randint(0, 255, (3, 100, 100), dtype=torch.uint8)
        result = model._to_pil(img)

        assert isinstance(result, Image.Image)
        assert result.size == (100, 100)

    def test_torch_tensor_batch(self):
        """Test torch tensor with batch dimension"""
        torch = pytest.importorskip("torch")
        model = self._create_model()

        img = torch.randint(0, 255, (1, 3, 100, 100), dtype=torch.uint8)
        result = model._to_pil(img)

        assert isinstance(result, Image.Image)
        assert result.size == (100, 100)

    def test_torch_tensor_grayscale(self):
        """Test torch grayscale tensor"""
        torch = pytest.importorskip("torch")
        model = self._create_model()

        img = torch.randint(0, 255, (1, 100, 100), dtype=torch.uint8)
        result = model._to_pil(img)

        assert isinstance(result, Image.Image)

    def test_torch_tensor_rgba(self):
        """Test torch RGBA tensor"""
        torch = pytest.importorskip("torch")
        model = self._create_model()

        img = torch.randint(0, 255, (4, 100, 100), dtype=torch.uint8)
        result = model._to_pil(img)

        assert isinstance(result, Image.Image)
        assert result.size == (100, 100)

    def test_unsupported_type_raises(self):
        """Test unsupported type raises TypeError"""
        model = self._create_model()

        with pytest.raises(TypeError, match="Unsupported image type"):
            model._to_pil([1, 2, 3])


class TestHunyuan3DExportMesh:
    """Test _export_mesh functionality"""

    def _create_model(self, output_dir=None, output_format="obj"):
        """Create a model instance with output config"""
        from fiftyone.utils.hunyuan3d import Hunyuan3DModel

        model = Hunyuan3DModel.__new__(Hunyuan3DModel)
        model._output_dir = output_dir
        model._output_format = output_format
        model._output_dir_initialized = False
        return model

    def _create_mock_mesh(self, num_vertices=100, num_faces=50):
        """Create a mock mesh object"""
        class MockMesh:
            def __init__(self, vertices, faces):
                self.vertices = vertices
                self.faces = faces
                self._exported_path = None

            def export(self, path):
                self._exported_path = path
                with open(path, "w") as f:
                    f.write("mock mesh data")

        vertices = np.random.rand(num_vertices, 3)
        faces = np.random.randint(0, num_vertices, (num_faces, 3))
        return MockMesh(vertices, faces)

    def test_export_creates_label(self):
        """Test export returns a Label with correct attributes"""
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

    def test_export_custom_format(self):
        """Test export with custom format"""
        with tempfile.TemporaryDirectory() as tmpdir:
            model = self._create_model(output_dir=tmpdir, output_format="glb")
            mesh = self._create_mock_mesh()

            label = model._export_mesh(mesh)

            assert label.mesh_path.endswith(".glb")

    def test_export_creates_output_dir(self):
        """Test export creates output directory if needed"""
        with tempfile.TemporaryDirectory() as tmpdir:
            output_dir = os.path.join(tmpdir, "nested", "output")
            model = self._create_model(output_dir=output_dir)
            mesh = self._create_mock_mesh()

            label = model._export_mesh(mesh)

            assert os.path.isdir(output_dir)
            assert os.path.exists(label.mesh_path)

    def test_export_unique_filenames(self):
        """Test export generates unique filenames"""
        with tempfile.TemporaryDirectory() as tmpdir:
            model = self._create_model(output_dir=tmpdir)
            mesh1 = self._create_mock_mesh()
            mesh2 = self._create_mock_mesh()

            label1 = model._export_mesh(mesh1)
            label2 = model._export_mesh(mesh2)

            assert label1.mesh_path != label2.mesh_path


class TestHunyuan3DEnsureOutputDir:
    """Test _ensure_output_dir functionality"""

    def _create_model(self, output_dir=None):
        """Create a model instance"""
        from fiftyone.utils.hunyuan3d import Hunyuan3DModel

        model = Hunyuan3DModel.__new__(Hunyuan3DModel)
        model._output_dir = output_dir
        model._output_dir_initialized = False
        return model

    def test_creates_temp_dir_when_none(self):
        """Test creates temp directory when output_dir is None"""
        model = self._create_model(output_dir=None)
        model._ensure_output_dir()

        assert model._output_dir is not None
        assert os.path.isdir(model._output_dir)
        assert "hunyuan3d_" in model._output_dir
        assert model._output_dir_initialized is True

    def test_creates_specified_dir(self):
        """Test creates specified directory"""
        with tempfile.TemporaryDirectory() as tmpdir:
            output_dir = os.path.join(tmpdir, "my_meshes")
            model = self._create_model(output_dir=output_dir)
            model._ensure_output_dir()

            assert os.path.isdir(output_dir)
            assert model._output_dir_initialized is True

if __name__ == "__main__":
    pytest.main([__file__, "-v"])
