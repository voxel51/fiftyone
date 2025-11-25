"""
HRM2.0 (4D-Humans) model unit tests.

| Copyright 2017-2025, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""
import os
import random
import string
import sys
import tempfile
import unittest
from unittest.mock import MagicMock, Mock, patch, PropertyMock
from types import SimpleNamespace

import numpy as np
from PIL import Image

import eta.core.utils as etau

import fiftyone as fo
import fiftyone.utils.image as foui

from decorators import drop_datasets


# Mock external dependencies before importing hrm2
sys.modules["hmr2"] = MagicMock()
sys.modules["hmr2.models"] = MagicMock()
sys.modules["hmr2.configs"] = MagicMock()
sys.modules["hmr2.utils"] = MagicMock()
sys.modules["hmr2.utils.utils_detectron2"] = MagicMock()
sys.modules["detectron2"] = MagicMock()
sys.modules["detectron2.config"] = MagicMock()
sys.modules["detectron2.engine"] = MagicMock()
sys.modules["detectron2.model_zoo"] = MagicMock()
sys.modules["smplx"] = MagicMock()
sys.modules["trimesh"] = MagicMock()
sys.modules["trimesh.transformations"] = MagicMock()


class MockHMR2Model:
    """Mock HMR2 model for testing without actual model dependencies."""

    def __init__(self, cfg):
        self.cfg = cfg
        # Mock config attributes
        self.cfg.MODEL = MagicMock()
        self.cfg.MODEL.IMAGE_SIZE = 256
        self.cfg.MODEL.IMAGE_MEAN = [0.485, 0.456, 0.406]
        self.cfg.MODEL.IMAGE_STD = [0.229, 0.224, 0.225]
        self.cfg.EXTRA = MagicMock()
        self.cfg.EXTRA.FOCAL_LENGTH = 5000.0
        self.cfg.SMPL = MagicMock()
        self.cfg.SMPL.MODEL_PATH = "/tmp/smpl"
        self.cfg.SMPL.MEAN_PARAMS = "/tmp/smpl_mean_params.npz"
        self.cfg.SMPL.JOINT_REGRESSOR_EXTRA = "/tmp/J_regressor_extra.npy"

    def __call__(self, batch):
        batch_size = batch["img"].shape[0]
        # Return mock predictions
        return {
            "pred_cam": np.random.randn(batch_size, 3).astype(np.float32),
            "pred_smpl_params": {
                "body_pose": np.random.randn(batch_size, 23, 3, 3).astype(
                    np.float32
                ),
                "betas": np.random.randn(batch_size, 10).astype(np.float32),
                "global_orient": np.random.randn(batch_size, 1, 3, 3).astype(
                    np.float32
                ),
            },
            "pred_keypoints_3d": np.random.randn(batch_size, 24, 3).astype(
                np.float32
            ),
            "pred_keypoints_2d": np.random.randn(batch_size, 24, 2).astype(
                np.float32
            ),
        }

    def to(self, device):
        return self

    def half(self):
        return self

    def eval(self):
        return self

    def load_state_dict(self, state_dict):
        pass


class MockSMPL:
    """Mock SMPL model for testing."""

    def __init__(self, *args, **kwargs):
        self.faces = np.random.randint(0, 100, size=(1000, 3))

    def __call__(self, **kwargs):
        batch_size = kwargs["betas"].shape[0]
        mock_output = MagicMock()
        mock_output.vertices = np.random.randn(batch_size, 6890, 3).astype(
            np.float32
        )
        return mock_output

    def to(self, device):
        return self

    def half(self):
        return self

    def eval(self):
        return self


class MockDetectron2Predictor:
    """Mock Detectron2 predictor for testing."""

    def __init__(self, cfg=None):
        self.cfg = cfg

    def __call__(self, img):
        import torch

        # Return 2 mock person detections
        instances = MagicMock()
        instances.pred_classes = torch.tensor([0, 0])  # Person class
        instances.scores = torch.tensor([0.95, 0.85])

        # Mock bounding boxes [x1, y1, x2, y2]
        boxes_tensor = MagicMock()
        boxes_tensor.tensor = torch.tensor(
            [[100, 50, 300, 400], [350, 100, 550, 450]]
        ).float()

        instances.pred_boxes = boxes_tensor
        return {"instances": instances}


class HRM2TestBase(unittest.TestCase):
    """Base class for HRM2 tests with common setup."""

    def setUp(self):
        # Create temporary directory for test files
        temp_dir = etau.TempDir()
        root_dir = temp_dir.__enter__()
        ref_image_path = os.path.join(root_dir, "_ref_image.jpg")
        images_dir = os.path.join(root_dir, "_images")

        # Create a test image
        img = np.random.randint(255, size=(480, 640, 3), dtype=np.uint8)
        foui.write(img, ref_image_path)

        self.root_dir = root_dir
        self.images_dir = images_dir
        self._temp_dir = temp_dir
        self._ref_image_path = ref_image_path

        # Create mock SMPL files for config validation
        self.mock_smpl_path = os.path.join(root_dir, "SMPL_NEUTRAL.pkl")
        with open(self.mock_smpl_path, "w") as f:
            f.write("mock smpl data")

    def tearDown(self):
        self._temp_dir.__exit__()

    def _new_image(self, name=None):
        """Create a new test image."""
        if name is None:
            name = self._new_name()

        filepath = os.path.join(
            self.images_dir,
            name + os.path.splitext(self._ref_image_path)[1],
        )

        etau.copy_file(self._ref_image_path, filepath)
        return filepath

    def _new_name(self):
        """Generate a random name."""
        return "".join(
            random.choice(string.ascii_lowercase + string.digits)
            for _ in range(24)
        )


class HRM2ConfigTests(HRM2TestBase):
    """Tests for HRM2Config class."""

    def test_hrm2_config_default_initialization(self):
        """Test HRM2Config with default parameters."""
        from fiftyone.utils.hrm2 import HRM2Config

        config_dict = {
            "smpl_model_path": self.mock_smpl_path,
        }

        config = HRM2Config(config_dict)

        self.assertEqual(config.smpl_model_path, self.mock_smpl_path)
        self.assertEqual(config.checkpoint_version, "2.0b")
        self.assertTrue(config.export_meshes)
        self.assertIsNone(config.detections_field)
        self.assertTrue(config.ragged_batches)

    def test_hrm2_config_custom_parameters(self):
        """Test HRM2Config with custom parameters."""
        from fiftyone.utils.hrm2 import HRM2Config

        config_dict = {
            "smpl_model_path": self.mock_smpl_path,
            "checkpoint_version": "1.0",
            "export_meshes": False,
            "detections_field": "ground_truth_detections",
        }

        config = HRM2Config(config_dict)

        self.assertEqual(config.checkpoint_version, "1.0")
        self.assertFalse(config.export_meshes)
        self.assertEqual(config.detections_field, "ground_truth_detections")
        self.assertTrue(config.ragged_batches)

    def test_hrm2_config_invalid_smpl_path(self):
        """Test that HRM2Config raises error for invalid SMPL path."""
        from fiftyone.utils.hrm2 import HRM2Config

        config_dict = {
            "smpl_model_path": "/nonexistent/path/SMPL_NEUTRAL.pkl",
        }

        with self.assertRaises(ValueError) as cm:
            HRM2Config(config_dict)

        self.assertIn("SMPL model not found", str(cm.exception))

    def test_hrm2_config_none_smpl_path(self):
        """Test that HRM2Config allows None for smpl_model_path."""
        from fiftyone.utils.hrm2 import HRM2Config

        config_dict = {
            "smpl_model_path": None,
        }

        # Should not raise an error
        config = HRM2Config(config_dict)
        self.assertIsNone(config.smpl_model_path)

    def test_hrm2_config_output_processor_args_serializable(self):
        """Test that config.output_processor_args contains only serializable parameters."""
        from fiftyone.utils.hrm2 import HRM2Config
        import json

        config_dict = {
            "checkpoint_version": "2.0b",
            "export_meshes": True,
            "confidence_thresh": 0.5,
        }

        config = HRM2Config(config_dict)

        # Check that output_processor_args are set correctly
        self.assertIsNotNone(config.output_processor_args)
        self.assertIn("export_meshes", config.output_processor_args)
        self.assertIn("confidence_thresh", config.output_processor_args)

        # Verify non-serializable args are NOT in config
        self.assertNotIn("smpl_model", config.output_processor_args)
        self.assertNotIn("device", config.output_processor_args)

        # Test JSON serialization
        try:
            json_str = json.dumps(config.output_processor_args)
            self.assertIsNotNone(json_str)
        except Exception as e:
            self.fail(f"Config args should be JSON-serializable: {e}")

    def test_hrm2_config_output_processor_args_values(self):
        """Test that output_processor_args are correctly populated from config."""
        from fiftyone.utils.hrm2 import HRM2Config

        config_dict = {
            "export_meshes": False,
            "confidence_thresh": 0.7,
        }

        config = HRM2Config(config_dict)

        # Verify args match config values
        self.assertEqual(config.output_processor_args["export_meshes"], False)
        self.assertEqual(
            config.output_processor_args["confidence_thresh"], 0.7
        )


class HRM2UtilityTests(unittest.TestCase):
    """Tests for HRM2 utility functions."""

    def test_numpy_to_python_scalar(self):
        """Test numpy scalar conversion."""
        from fiftyone.core.utils import numpy_to_python

        # Test float types
        result = numpy_to_python(np.float32(3.14))
        self.assertIsInstance(result, float)
        self.assertAlmostEqual(result, 3.14, places=5)

        result = numpy_to_python(np.float64(2.71))
        self.assertIsInstance(result, float)

        # Test int types
        result = numpy_to_python(np.int32(42))
        self.assertIsInstance(result, int)
        self.assertEqual(result, 42)

        result = numpy_to_python(np.int64(100))
        self.assertIsInstance(result, int)

    def test_numpy_to_python_array(self):
        """Test numpy array conversion."""
        from fiftyone.core.utils import numpy_to_python

        arr = np.array([1.0, 2.0, 3.0], dtype=np.float32)
        result = numpy_to_python(arr)

        self.assertIsInstance(result, list)
        self.assertEqual(result, [1.0, 2.0, 3.0])

    def test_numpy_to_python_nested_dict(self):
        """Test nested dictionary with numpy types."""
        from fiftyone.core.utils import numpy_to_python

        data = {
            "float_val": np.float32(1.5),
            "int_val": np.int64(42),
            "array": np.array([1, 2, 3]),
            "nested": {"value": np.float64(2.5)},
        }

        result = numpy_to_python(data)

        self.assertIsInstance(result["float_val"], float)
        self.assertIsInstance(result["int_val"], int)
        self.assertIsInstance(result["array"], list)
        self.assertIsInstance(result["nested"]["value"], float)

    def test_numpy_to_python_list(self):
        """Test list with numpy types."""
        from fiftyone.core.utils import numpy_to_python

        data = [np.float32(1.0), np.int32(2), np.array([3, 4])]
        result = numpy_to_python(data)

        self.assertIsInstance(result, list)
        self.assertIsInstance(result[0], float)
        self.assertIsInstance(result[1], int)
        self.assertIsInstance(result[2], list)

    def test_cam_crop_to_full_numpy(self):
        """Test camera crop to full image coordinate transformation (numpy)."""
        from fiftyone.utils.hrm2 import cam_crop_to_full

        pred_cam = np.array([2.0, 0.1, 0.2])  # [s, tx, ty]
        box_center = np.array([320.0, 240.0])  # [cx, cy]
        box_size = 200.0
        img_size = np.array([640.0, 480.0])  # [width, height]
        focal_length = 5000.0

        result = cam_crop_to_full(
            pred_cam, box_center, box_size, img_size, focal_length
        )

        self.assertIsInstance(result, np.ndarray)
        self.assertEqual(result.shape, (3,))
        # tz should be positive (depth)
        self.assertGreater(result[2], 0)

    def test_cam_crop_to_full_torch(self):
        """Test camera crop to full image coordinate transformation (torch)."""
        import torch
        from fiftyone.utils.hrm2 import cam_crop_to_full

        pred_cam = torch.tensor([[2.0, 0.1, 0.2]])
        box_center = torch.tensor([[320.0, 240.0]])
        box_size = torch.tensor([200.0])
        img_size = torch.tensor([[640.0, 480.0]])
        focal_length = 5000.0

        result = cam_crop_to_full(
            pred_cam, box_center, box_size, img_size, focal_length
        )

        self.assertIsInstance(result, torch.Tensor)
        self.assertEqual(result.shape, (1, 3))
        # tz should be positive (depth)
        self.assertGreater(result[0, 2].item(), 0)


class HRM2OutputProcessorTests(HRM2TestBase):
    """Tests for HRM2OutputProcessor class."""

    def test_output_processor_without_smpl(self):
        """Test that output processor disables mesh export when SMPL is missing."""
        from fiftyone.utils.hrm2 import HRM2OutputProcessor

        processor = HRM2OutputProcessor(
            export_meshes=True,
            confidence_thresh=0.5,
        )

        # Should warn and disable mesh export
        self.assertFalse(processor.export_meshes)
        self.assertIsNone(processor._smpl)

    def test_output_processor_with_smpl(self):
        """Test that output processor keeps mesh export enabled with SMPL model."""
        import torch
        from fiftyone.utils.hrm2 import HRM2OutputProcessor

        # Create a mock SMPL model
        mock_smpl = torch.nn.Linear(1, 1)
        mock_device = torch.device("cpu")

        processor = HRM2OutputProcessor(
            smpl_model=mock_smpl,
            device=mock_device,
            export_meshes=True,
            confidence_thresh=0.5,
        )

        # Should keep mesh export enabled
        self.assertTrue(processor.export_meshes)
        self.assertIsNotNone(processor._smpl)
        self.assertEqual(processor._device, mock_device)

    def test_output_processor_resource_injection_workflow(self):
        """Test the complete workflow of config → runtime resource injection."""
        import torch
        import json
        from fiftyone.utils.hrm2 import HRM2Config, HRM2OutputProcessor

        # Step 1: Create config with serializable args only
        config_dict = {
            "checkpoint_version": "2.0b",
            "export_meshes": True,
            "confidence_thresh": 0.5,
        }

        config = HRM2Config(config_dict)

        # Step 2: Verify config args are serializable
        self.assertIn("export_meshes", config.output_processor_args)
        self.assertIn("confidence_thresh", config.output_processor_args)
        self.assertNotIn("smpl_model", config.output_processor_args)
        self.assertNotIn("device", config.output_processor_args)

        # Step 3: Simulate runtime resource injection
        processor_args = config.output_processor_args.copy()
        mock_smpl = torch.nn.Linear(1, 1)
        mock_device = torch.device("cpu")

        processor_args.update(
            {
                "smpl_model": mock_smpl,
                "device": mock_device,
            }
        )

        # Step 4: Create processor with injected resources
        processor = HRM2OutputProcessor(**processor_args)

        self.assertTrue(processor.export_meshes)
        self.assertIsNotNone(processor._smpl)

        # Step 5: Cleanup config (simulate what _build_output_processor does)
        config.output_processor_args.pop("smpl_model", None)
        config.output_processor_args.pop("device", None)

        # Step 6: Verify config is still serializable
        json_str = json.dumps(config.output_processor_args)
        self.assertIsNotNone(json_str)

    def test_output_processor_call_with_rotation_matrices(self):
        """Test HRM2OutputProcessor.__call__() with realistic rotation matrix data."""
        import torch
        from fiftyone.utils.hrm2 import HRM2OutputProcessor
        from fiftyone.core.labels import (
            MeshInstances3D,
            MeshInstance3D,
            Mesh3D,
            Keypoint,
            Detection,
            Camera,
        )

        # Create processor without SMPL (no mesh export)
        processor = HRM2OutputProcessor(
            export_meshes=False,
            confidence_thresh=0.5,
        )

        # Simulate realistic HRM2 model outputs with rotation matrices
        outputs = [
            {
                "people": [
                    {
                        "pred_cam": torch.tensor([2.0, 0.1, 0.2]),
                        "pred_smpl_params": {
                            "body_pose": torch.randn(
                                23, 3, 3
                            ),  # Rotation matrices
                            "betas": torch.randn(10),
                            "global_orient": torch.randn(
                                1, 3, 3
                            ),  # Rotation matrix
                        },
                        "pred_keypoints_3d": torch.randn(24, 3),
                        "pred_keypoints_2d": torch.randn(24, 2),
                        "bbox": [100.0, 100.0, 200.0, 200.0],
                        "person_id": 0,
                        "camera_translation": [0.0, 0.0, 5.0],
                    }
                ],
                "img_shape": (480, 640),
            }
        ]

        # Call the processor (now returns a dict)
        labels = processor(outputs, frame_size=(640, 480))

        # Verify output structure - now a dict
        self.assertEqual(len(labels), 1)
        self.assertIsInstance(labels[0], dict)
        self.assertIn("poses_2d", labels[0])
        self.assertIn("poses_3d", labels[0])

        # Verify MeshInstances3D structure
        mesh_instances = labels[0]["poses_3d"]
        self.assertIsInstance(mesh_instances, MeshInstances3D)
        self.assertEqual(len(mesh_instances.instances), 1)

        mesh_instance = mesh_instances.instances[0]
        self.assertIsInstance(mesh_instance, MeshInstance3D)

        # Verify MeshInstance3D structure with embedded label types
        self.assertEqual(mesh_instance.instance_id, 0)
        self.assertEqual(mesh_instance.label, "person")
        # MeshInstance3D uses embedded Detection and Keypoint (for 2D)
        self.assertIsNotNone(mesh_instance.keypoints_3d)
        # keypoints_3d is now wrapped in Keypoints3D label
        from fiftyone.core.labels import Keypoints3D

        self.assertIsInstance(mesh_instance.keypoints_3d, Keypoints3D)
        self.assertIsNotNone(mesh_instance.keypoints_2d)
        self.assertIsInstance(mesh_instance.keypoints_2d, Keypoint)
        self.assertIsNotNone(mesh_instance.detection)
        self.assertIsInstance(mesh_instance.detection, Detection)
        self.assertIsNotNone(mesh_instance.detection.bounding_box)

        # Verify SMPL params are now in attributes dict
        self.assertIsNotNone(mesh_instance.attributes)
        self.assertIn("smpl_params", mesh_instance.attributes)
        smpl_params = mesh_instance.attributes["smpl_params"]
        self.assertEqual(len(smpl_params["body_pose"]), 23)
        self.assertEqual(len(smpl_params["body_pose"][0]), 3)
        self.assertEqual(len(smpl_params["body_pose"][0][0]), 3)
        self.assertEqual(len(smpl_params["betas"]), 10)
        self.assertEqual(len(smpl_params["global_orient"]), 1)
        self.assertEqual(len(smpl_params["global_orient"][0]), 3)

        # Verify camera is in MeshInstance3D
        self.assertIsNotNone(mesh_instance.camera)
        self.assertIsInstance(mesh_instance.camera, Camera)
        self.assertIsNotNone(mesh_instance.camera.translation)

    def test_output_processor_with_mesh_export(self):
        """Test HRM2OutputProcessor with export_meshes=True to catch serialization bugs.

        This test specifically validates:
        1. Mesh data is properly wrapped in Mesh3D objects
        2. faces are set in the Mesh3D object
        3. The full mesh export pipeline works end-to-end
        """
        import torch
        import numpy as np
        from fiftyone.utils.hrm2 import HRM2OutputProcessor
        from fiftyone.core.labels import MeshInstances3D

        # Create mock SMPL model with faces
        mock_smpl = MockSMPL()
        mock_device = torch.device("cpu")

        # Create processor WITH mesh export enabled
        processor = HRM2OutputProcessor(
            smpl_model=mock_smpl,
            device=mock_device,
            export_meshes=True,
            confidence_thresh=0.5,
        )

        # Verify mesh export is enabled
        self.assertTrue(processor.export_meshes)

        # Simulate HRM2 model outputs with vertices (needed for mesh export)
        # Make sure vertices are proper numpy arrays/tensors that will convert correctly
        vertices_data = torch.randn(6890, 3)

        outputs = [
            {
                "people": [
                    {
                        "pred_cam": torch.tensor([2.0, 0.1, 0.2]),
                        "pred_smpl_params": {
                            "body_pose": torch.randn(23, 3, 3),
                            "betas": torch.randn(10),
                            "global_orient": torch.randn(1, 3, 3),
                        },
                        "pred_keypoints_3d": torch.randn(24, 3),
                        "pred_keypoints_2d": torch.randn(24, 2),
                        "pred_vertices": vertices_data,  # Include vertices as tensor
                        "bbox": [100.0, 100.0, 200.0, 200.0],
                        "person_id": 0,
                        "camera_translation": torch.tensor([0.0, 0.0, 5.0]),
                    }
                ],
                "img_shape": (480, 640),
            }
        ]

        # Configure the globally mocked trimesh for coordinate transformations
        import sys

        mock_trimesh = sys.modules["trimesh"]
        mock_rot_matrix = np.eye(4)
        mock_trimesh.transformations.rotation_matrix.return_value = (
            mock_rot_matrix
        )

        # Call the processor - this should trigger _prepare_scene_data
        labels = processor(outputs, frame_size=(640, 480))

        # Verify output structure
        self.assertEqual(len(labels), 1)
        self.assertIsInstance(labels[0], dict)
        self.assertIn("poses_3d", labels[0])

        # CRITICAL: Verify mesh data is properly wrapped in Mesh3D objects
        mesh_instances = labels[0]["poses_3d"]
        self.assertIsInstance(mesh_instances, MeshInstances3D)

        # Get first instance
        self.assertEqual(len(mesh_instances.instances), 1)
        mesh_instance = mesh_instances.instances[0]

        # Verify mesh is a Mesh3D object
        from fiftyone.core.labels import Mesh3D

        self.assertIsNotNone(
            mesh_instance.mesh,
            "mesh should not be None when export_meshes=True",
        )
        self.assertIsInstance(
            mesh_instance.mesh,
            Mesh3D,
            f"mesh should be Mesh3D object, got {type(mesh_instance.mesh)}",
        )

        # Verify faces are in the Mesh3D object
        mesh = mesh_instance.mesh
        self.assertIsNotNone(mesh.faces, "mesh.faces should not be None")
        self.assertIsInstance(mesh.faces, list, "mesh.faces should be a list")
        # Each face should be a list of 3 vertex indices
        if len(mesh.faces) > 0:
            self.assertEqual(
                len(mesh.faces[0]), 3, "Each face should have 3 vertices"
            )

        # Verify vertices are also present
        self.assertIsNotNone(mesh.vertices, "mesh.vertices should not be None")
        self.assertIsInstance(
            mesh.vertices, list, "mesh.vertices should be a list"
        )

        # Verify frame_size is also set correctly
        frame_size = mesh_instances.frame_size
        self.assertIsNotNone(frame_size)
        self.assertEqual(frame_size, [480, 640])


class HRM2ModelTests(HRM2TestBase):
    """Tests for HRM2Model class."""

    def _create_mock_config(self, **kwargs):
        """Create a mock HRM2Config for testing."""
        from fiftyone.utils.hrm2 import HRM2Config

        config_dict = {
            "model_path": kwargs.get("model_path", "/tmp/hrm2_test_model.pth"),
            "smpl_model_path": kwargs.get("smpl_model_path", None),
            "checkpoint_version": kwargs.get("checkpoint_version", "2.0b"),
            "export_meshes": kwargs.get("export_meshes", False),
            "detections_field": kwargs.get("detections_field", None),
        }

        return HRM2Config(config_dict)

    @patch(
        "fiftyone.utils.hrm2._get_hrm2_checkpoint_path",
        return_value="/tmp/hrm2_checkpoint.ckpt",
    )
    @patch(
        "fiftyone.utils.hrm2._resolve_hrm2_config_path",
        return_value="/tmp/model_config.yaml",
    )
    @patch("os.path.exists", return_value=True)
    @patch("torch.load", return_value={"state_dict": {}})
    @patch("hmr2.models.HMR2")
    @patch("hmr2.configs.get_config")
    def test_hrm2_model_initialization(
        self,
        mock_get_config,
        mock_hmr2_class,
        mock_load,
        mock_exists,
        mock_resolve_config,
        mock_get_checkpoint,
    ):
        """Test HRM2Model initialization with mocked dependencies."""
        import fiftyone.utils.hrm2 as hrm2_module

        # Setup mock config
        mock_cfg = MagicMock()
        mock_cfg.SMPL.MODEL_PATH = "/tmp/smpl"
        mock_cfg.SMPL.MEAN_PARAMS = "/tmp/smpl_mean_params.npz"
        mock_cfg.SMPL.JOINT_REGRESSOR_EXTRA = "/tmp/J_regressor_extra.npy"
        mock_cfg.MODEL.IMAGE_SIZE = 256
        mock_cfg.MODEL.IMAGE_MEAN = [0.485, 0.456, 0.406]
        mock_cfg.MODEL.IMAGE_STD = [0.229, 0.224, 0.225]
        mock_cfg.EXTRA.FOCAL_LENGTH = 5000.0
        mock_get_config.return_value = mock_cfg

        # Setup mock HMR2 model instance
        mock_hmr2_instance = MockHMR2Model(mock_cfg)
        mock_hmr2_class.return_value = mock_hmr2_instance

        config = self._create_mock_config()
        model = hrm2_module.HRM2Model(config)

        self.assertIsNotNone(model)
        # Explicitly load the model (parent class uses lazy loading)
        if model._hmr2 is None:
            model._load_model(config)
        self.assertIsNotNone(model._hmr2)

    @patch(
        "fiftyone.utils.hrm2._get_hrm2_checkpoint_path",
        return_value="/tmp/hrm2_checkpoint.ckpt",
    )
    @patch(
        "fiftyone.utils.hrm2._resolve_hrm2_config_path",
        return_value="/tmp/model_config.yaml",
    )
    @patch("os.path.exists", return_value=True)
    @patch("torch.load", return_value={"state_dict": {}})
    def test_hrm2_model_predict_single_person(
        self, mock_load, mock_exists, mock_resolve_config, mock_get_checkpoint
    ):
        """Test HRM2Model prediction in single-person mode."""
        from fiftyone.utils.hrm2 import HRM2Model
        from hmr2.configs import get_config
        from hmr2.models import HMR2

        # Setup mocks
        mock_cfg = MagicMock()
        mock_cfg.SMPL.MODEL_PATH = "/tmp/smpl"
        mock_cfg.SMPL.MEAN_PARAMS = "/tmp/smpl_mean_params.npz"
        mock_cfg.SMPL.JOINT_REGRESSOR_EXTRA = "/tmp/J_regressor_extra.npy"
        get_config.return_value = mock_cfg

        mock_hmr2_instance = MockHMR2Model(mock_cfg)
        HMR2.return_value = mock_hmr2_instance

        config = self._create_mock_config()
        model = HRM2Model(config)
        model._hmr2 = mock_hmr2_instance

        # Create test image
        img = Image.open(self._ref_image_path)

        # Ensure model has output processor
        import torch
        from fiftyone.utils.hrm2 import HRM2OutputProcessor

        if model._output_processor is None:
            model._output_processor = HRM2OutputProcessor(
                smpl_model=None,
                export_meshes=False,
            )

        # Mock the _inference_single_person method
        with patch.object(model, "_inference_single_person") as mock_inference:
            # Return raw output format with tensors and ROTATION MATRICES
            mock_inference.return_value = {
                "people": [
                    {
                        "pred_cam": torch.tensor([2.0, 0.0, 0.0]),
                        "pred_smpl_params": {
                            "body_pose": torch.randn(
                                23, 3, 3
                            ),  # Rotation matrices
                            "betas": torch.zeros(10),
                            "global_orient": torch.randn(
                                1, 3, 3
                            ),  # Rotation matrix
                        },
                        "pred_keypoints_3d": torch.zeros(24, 3),
                        "pred_keypoints_2d": torch.ones(24, 2) * 100.0,
                        "bbox": None,
                        "person_id": 0,
                        "camera_translation": None,
                    }
                ],
                "img_shape": (480, 640),
            }

            result = model.predict(img)

        # Result should be a dict with label types
        from fiftyone.core.labels import (
            MeshInstances3D,
            MeshInstance3D,
        )

        self.assertIsInstance(result, dict)
        self.assertIn("poses_3d", result)

        mesh_instances = result["poses_3d"]
        self.assertIsInstance(mesh_instances, MeshInstances3D)
        self.assertIsNotNone(mesh_instances.instances)
        self.assertEqual(len(mesh_instances.instances), 1)

        # Verify the processed output has MeshInstance3D structure
        mesh_instance = mesh_instances.instances[0]
        self.assertIsInstance(mesh_instance, MeshInstance3D)
        self.assertIsNotNone(mesh_instance.attributes)
        self.assertIn("smpl_params", mesh_instance.attributes)
        self.assertIsNotNone(mesh_instance.keypoints_3d)
        self.assertEqual(mesh_instance.instance_id, 0)

    def test_inference_single_person_uses_shared_preprocessor(self):
        """Ensure single-person inference uses shared ViTDet preprocessing."""
        from fiftyone.utils.hrm2 import HRM2Model
        from fiftyone.utils.torch import get_target_size

        model = object.__new__(HRM2Model)
        model.config = SimpleNamespace(confidence_thresh=None)
        model._device = "cpu"
        model._hmr2 = SimpleNamespace()
        model._hmr2.cfg = SimpleNamespace(
            MODEL=SimpleNamespace(
                IMAGE_SIZE=256,
                IMAGE_MEAN=[0.485, 0.456, 0.406],
                IMAGE_STD=[0.229, 0.224, 0.225],
            ),
            EXTRA=SimpleNamespace(FOCAL_LENGTH=5000.0),
        )

        test_img = np.zeros((480, 640, 3), dtype=np.uint8)

        mock_preprocessor = MagicMock()
        mock_img_tensor = MagicMock(name="img_tensor")
        box_center = np.array([320.0, 240.0], dtype=np.float32)
        bbox_size = 512.0
        img_size = np.array([640.0, 480.0], dtype=np.float32)
        mock_transform = np.eye(2, 3, dtype=np.float32)
        crop_window = (256, 256)
        mock_preprocessor.return_value = (
            mock_img_tensor,
            box_center,
            bbox_size,
            img_size,
            mock_transform,
            crop_window,
        )

        target_h, target_w = get_target_size(model._hmr2.cfg.MODEL.IMAGE_SIZE)
        expected_focal = (
            model._hmr2.cfg.EXTRA.FOCAL_LENGTH
            / max(target_h, target_w)
            * img_size.max()
        )

        dummy_cam_t = np.array([0.1, 0.2, 30.0], dtype=np.float32)
        pred_cam = np.array([2.0, 0.1, 0.2], dtype=np.float32)
        pred_pose = np.zeros(1, dtype=np.float32)
        pred_betas = np.zeros(1, dtype=np.float32)
        pred_global_orient = np.zeros(1, dtype=np.float32)
        pred_keypoints_3d = np.zeros((1, 3), dtype=np.float32)
        pred_keypoints_2d = np.zeros((1, 2), dtype=np.float32)
        dummy_vertices = np.zeros((6890, 3), dtype=np.float32)

        class DummyTensor:
            def __init__(self, array):
                self._array = array

            def cpu(self):
                return self

            def numpy(self):
                return self._array

        outputs = {"pred_vertices": [DummyTensor(dummy_vertices)]}

        with patch.object(
            model, "_get_preprocessor", return_value=mock_preprocessor
        ):
            with patch(
                "fiftyone.utils.torch.to_numpy_image",
                return_value=test_img.copy(),
            ):
                with patch.object(
                    model, "_run_inference", return_value=outputs
                ):
                    with patch.object(
                        model,
                        "_extract_predictions",
                        return_value=(
                            pred_cam,
                            pred_pose,
                            pred_betas,
                            pred_global_orient,
                            pred_keypoints_3d,
                            pred_keypoints_2d,
                        ),
                    ):
                        with patch(
                            "fiftyone.utils.hrm2.cam_crop_to_full",
                            return_value=dummy_cam_t,
                        ) as mock_cam_full:
                            with patch.object(
                                model,
                                "_build_person_raw",
                                return_value={"person": 0},
                            ) as mock_build:
                                result = model._inference_single_person(
                                    test_img, 0
                                )

        self.assertEqual(mock_preprocessor.call_count, 1)
        args, kwargs = mock_preprocessor.call_args
        self.assertEqual(kwargs, {})
        self.assertEqual(len(args), 1)
        np.testing.assert_array_equal(args[0], test_img)

        mock_cam_full.assert_called_once()
        cam_args, cam_kwargs = mock_cam_full.call_args
        self.assertEqual(len(cam_kwargs), 0)
        self.assertEqual(len(cam_args), 5)
        self.assertTrue(np.allclose(cam_args[0], pred_cam))
        self.assertTrue(np.allclose(cam_args[1], box_center))
        self.assertAlmostEqual(cam_args[2], bbox_size)
        self.assertTrue(np.allclose(cam_args[3], img_size))
        self.assertAlmostEqual(cam_args[4], expected_focal)

        self.assertEqual(mock_build.call_count, 1)
        _, build_kwargs = mock_build.call_args
        self.assertTrue(
            np.allclose(build_kwargs["camera_translation"], dummy_cam_t)
        )

        self.assertEqual(result["img_shape"], (480, 640))
        self.assertEqual(result["people"], [{"person": 0}])

    def test_inference_single_person_real_code_path(self):
        """Test _inference_single_person with real internal code (no internal mocking).

        This test exercises the real implementation of _build_person_raw and would
        have caught the person_data=None bug. Only external dependencies are mocked.
        """
        import torch
        from fiftyone.utils.hrm2 import HRM2Model

        # Setup model with minimal mocking
        model = object.__new__(HRM2Model)
        model.config = SimpleNamespace(confidence_thresh=None)
        model._device = torch.device("cpu")
        model._preprocessor = None

        # Create a properly configured mock HMR2 model
        cfg = MagicMock()
        cfg.MODEL.IMAGE_SIZE = 256
        cfg.MODEL.IMAGE_MEAN = [0.485, 0.456, 0.406]
        cfg.MODEL.IMAGE_STD = [0.229, 0.224, 0.225]
        cfg.MODEL.BBOX_SHAPE = None  # No aspect ratio expansion
        cfg.EXTRA.FOCAL_LENGTH = 5000.0

        mock_hmr2 = MagicMock()
        mock_hmr2.cfg = cfg
        model._hmr2 = mock_hmr2

        # Create test image
        test_img = np.random.randint(0, 255, (480, 640, 3), dtype=np.uint8)

        # Mock only the HMR2 model's forward pass (external dependency)
        def mock_forward(batch):
            batch_size = batch["img"].shape[0]
            return {
                "pred_cam": torch.tensor([[2.0, 0.1, 0.2]]),
                "pred_smpl_params": {
                    "body_pose": torch.randn(batch_size, 23, 3, 3),
                    "betas": torch.randn(batch_size, 10),
                    "global_orient": torch.randn(batch_size, 1, 3, 3),
                },
                "pred_keypoints_3d": torch.randn(batch_size, 24, 3),
                "pred_keypoints_2d": torch.randn(batch_size, 24, 2),
                "pred_vertices": torch.randn(batch_size, 6890, 3),
            }

        mock_hmr2.__call__ = mock_forward

        # This should execute ALL real internal code: _build_person_raw, etc.
        # If person_data=None bug existed, this would fail
        result = model._inference_single_person(test_img, 0)

        # Verify structure
        self.assertIn("people", result)
        self.assertIn("img_shape", result)
        self.assertEqual(len(result["people"]), 1)
        self.assertEqual(result["img_shape"], (480, 640))

        # Verify person data structure (from real _build_person_raw)
        person = result["people"][0]
        self.assertIn("pred_cam", person)
        self.assertIn("pred_smpl_params", person)
        self.assertIn("pred_keypoints_3d", person)
        self.assertIn("pred_vertices", person)
        self.assertIn("person_id", person)
        self.assertEqual(person["person_id"], 0)
        self.assertIsNone(person["bbox"])  # single-person mode

        # Verify camera_translation was computed (not None)
        self.assertIn("camera_translation", person)
        self.assertIsNotNone(person["camera_translation"])


class HRM2DatasetTests(HRM2TestBase):
    """Tests for HRM2Model dataset application."""

    def _make_dataset(self):
        """Create a test dataset with images."""
        samples = []
        for _ in range(3):
            sample = fo.Sample(filepath=self._new_image())
            samples.append(sample)

        dataset = fo.Dataset()
        dataset.add_samples(samples)
        return dataset


class HumanPoseLabelTests(HRM2TestBase):
    """Tests for HumanPose2D and MeshInstances3D label classes."""

    @drop_datasets
    def test_human_pose_2d_creation(self):
        """Test HumanPose2D label creation."""
        from fiftyone.core.labels import HumanPose2D, Keypoint, Detection

        keypoints = [[100.0, 150.0], [120.0, 170.0], [110.0, 180.0]]
        bbox = [90.0, 140.0, 50.0, 60.0]

        pose = Keypoint(points=keypoints)
        detection = Detection(bounding_box=bbox)
        label = HumanPose2D(pose=pose, detection=detection)

        self.assertEqual(label.pose.points, keypoints)
        self.assertEqual(label.detection.bounding_box, bbox)

    @drop_datasets
    def test_human_pose_2d_serialization(self):
        """Test saving and loading HumanPose2D from dataset."""
        from fiftyone.core.labels import HumanPose2D

        dataset = fo.Dataset()
        sample = fo.Sample(filepath=self._new_image())

        keypoints = [[100.0, 150.0], [120.0, 170.0]]
        label = HumanPose2D(keypoints=keypoints)
        sample["pose"] = label

        dataset.add_sample(sample)

        # Retrieve and verify
        retrieved = dataset.first()
        self.assertIsNotNone(retrieved["pose"])
        self.assertEqual(retrieved["pose"].keypoints, keypoints)


if __name__ == "__main__":
    unittest.main()
