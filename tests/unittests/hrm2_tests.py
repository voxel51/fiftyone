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
        import torch

        batch_size = batch["img"].shape[0]
        # Return mock predictions as torch tensors
        return {
            "pred_cam": torch.from_numpy(
                np.random.randn(batch_size, 3).astype(np.float32)
            ).to(torch.float32),
            "pred_smpl_params": {
                "body_pose": torch.from_numpy(
                    np.random.randn(batch_size, 23, 3, 3).astype(np.float32)
                ).to(torch.float32),
                "betas": torch.from_numpy(
                    np.random.randn(batch_size, 10).astype(np.float32)
                ).to(torch.float32),
                "global_orient": torch.from_numpy(
                    np.random.randn(batch_size, 1, 3, 3).astype(np.float32)
                ).to(torch.float32),
            },
            "pred_keypoints_3d": torch.from_numpy(
                np.random.randn(batch_size, 24, 3).astype(np.float32)
            ).to(torch.float32),
            "pred_keypoints_2d": torch.from_numpy(
                np.random.randn(batch_size, 24, 2).astype(np.float32)
            ).to(torch.float32),
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


class HRM2ModelConfigTests(HRM2TestBase):
    """Tests for HRM2ModelConfig class."""

    def test_hrm2_config_default_initialization(self):
        """Test HRM2ModelConfig with default parameters."""
        from fiftyone.utils.hrm2 import HRM2ModelConfig

        config_dict = {
            "smpl_model_path": self.mock_smpl_path,
        }

        config = HRM2ModelConfig(config_dict)

        self.assertEqual(config.smpl_model_path, self.mock_smpl_path)
        self.assertEqual(config.checkpoint_version, "2.0b")
        self.assertTrue(config.export_meshes)
        self.assertFalse(config.ragged_batches)

    def test_hrm2_config_custom_parameters(self):
        """Test HRM2ModelConfig with custom parameters."""
        from fiftyone.utils.hrm2 import HRM2ModelConfig

        config_dict = {
            "smpl_model_path": self.mock_smpl_path,
            "checkpoint_version": "1.0",
            "export_meshes": False,
        }

        config = HRM2ModelConfig(config_dict)

        self.assertEqual(config.checkpoint_version, "1.0")
        self.assertFalse(config.export_meshes)
        self.assertFalse(config.ragged_batches)

    def test_hrm2_config_invalid_smpl_path(self):
        """Test that HRM2ModelConfig raises error for invalid SMPL path."""
        from fiftyone.utils.hrm2 import HRM2ModelConfig

        config_dict = {
            "smpl_model_path": "/nonexistent/path/SMPL_NEUTRAL.pkl",
        }

        with self.assertRaises(ValueError) as cm:
            HRM2ModelConfig(config_dict)

        self.assertIn("SMPL model not found", str(cm.exception))

    def test_hrm2_config_none_smpl_path(self):
        """Test that HRM2ModelConfig allows None for smpl_model_path."""
        from fiftyone.utils.hrm2 import HRM2ModelConfig

        config_dict = {
            "smpl_model_path": None,
        }

        # Should not raise an error
        config = HRM2ModelConfig(config_dict)
        self.assertIsNone(config.smpl_model_path)

    def test_hrm2_config_output_processor_args_serializable(self):
        """Test that config.output_processor_args contains only serializable parameters."""
        from fiftyone.utils.hrm2 import HRM2ModelConfig
        import json

        config_dict = {
            "checkpoint_version": "2.0b",
            "export_meshes": True,
        }

        config = HRM2ModelConfig(config_dict)

        # Check that output_processor_args are set correctly
        self.assertIsNotNone(config.output_processor_args)
        self.assertIn("export_meshes", config.output_processor_args)

        # Verify non-serializable args are NOT in config
        self.assertNotIn("smpl_model", config.output_processor_args)
        self.assertNotIn("device", config.output_processor_args)

        # Test JSON serialization
        try:
            json_str = json.dumps(config.output_processor_args)
            self.assertIsNotNone(json_str)
        except TypeError as e:
            self.fail(f"Config args should be JSON-serializable: {e}")

    def test_hrm2_config_output_processor_args_values(self):
        """Test that output_processor_args are correctly populated from config."""
        from fiftyone.utils.hrm2 import HRM2ModelConfig

        config_dict = {
            "export_meshes": False,
        }

        config = HRM2ModelConfig(config_dict)

        # Verify args match config values
        self.assertEqual(config.output_processor_args["export_meshes"], False)


class HRM2GetItemTests(unittest.TestCase):
    """Tests for HRM2GetItem class."""

    def test_required_keys_are_static(self):
        """Test that HRM2GetItem.required_keys always returns static keys."""
        from fiftyone.utils.hrm2 import HRM2GetItem

        # Test with no field_mapping
        get_item = HRM2GetItem(field_mapping=None)
        self.assertEqual(get_item.required_keys, ["filepath", "prompt_field"])

        # Test with field_mapping provided
        get_item = HRM2GetItem(field_mapping={"prompt_field": "detections"})
        self.assertEqual(get_item.required_keys, ["filepath", "prompt_field"])

        # Test with empty field_mapping
        get_item = HRM2GetItem(field_mapping={})
        self.assertEqual(get_item.required_keys, ["filepath", "prompt_field"])

    def test_get_item_instantiation(self):
        """Test that HRM2GetItem can be instantiated with various parameters."""
        from fiftyone.utils.hrm2 import HRM2GetItem

        # Test basic instantiation
        get_item = HRM2GetItem()
        self.assertIsNotNone(get_item)
        self.assertIsNone(get_item.transform)
        self.assertFalse(get_item.use_numpy)

        # Test with transform
        def mock_transform(x):
            return x

        get_item = HRM2GetItem(transform=mock_transform, use_numpy=True)
        self.assertEqual(get_item.transform, mock_transform)
        self.assertTrue(get_item.use_numpy)


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
        )

        # Should keep mesh export enabled
        self.assertTrue(processor.export_meshes)
        self.assertIsNotNone(processor._smpl)
        self.assertEqual(processor._device, mock_device)

    def test_output_processor_resource_injection_workflow(self):
        """Test the complete workflow of config → runtime resource injection."""
        import torch
        import json
        from fiftyone.utils.hrm2 import HRM2ModelConfig, HRM2OutputProcessor

        # Step 1: Create config with serializable args only
        config_dict = {
            "checkpoint_version": "2.0b",
            "export_meshes": True,
        }

        config = HRM2ModelConfig(config_dict)

        # Step 2: Verify config args are serializable
        self.assertIn("export_meshes", config.output_processor_args)
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
        from fiftyone.utils.hrm2 import (
            HRM2OutputProcessor,
            HRM2Person,
            SMPLParams,
        )
        from fiftyone.core.labels import Keypoints, Detections

        # Create processor without SMPL (no mesh export)
        processor = HRM2OutputProcessor(
            export_meshes=False,
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
        labels = processor(outputs)

        # Verify output structure - now a dict with new format
        self.assertEqual(len(labels), 1)
        self.assertIsInstance(labels[0], dict)
        self.assertIn("keypoints", labels[0])
        self.assertIn("detections", labels[0])
        self.assertIn("hrm2_people", labels[0])

        # Verify Keypoints structure
        keypoints = labels[0]["keypoints"]
        self.assertIsInstance(keypoints, Keypoints)
        self.assertEqual(len(keypoints.keypoints), 1)

        # Verify Detections structure
        detections = labels[0]["detections"]
        self.assertIsInstance(detections, Detections)
        self.assertEqual(len(detections.detections), 1)

        # Verify HRM2Person structure (DynamicEmbeddedDocument)
        hrm2_people = labels[0]["hrm2_people"]
        self.assertIsInstance(hrm2_people, list)
        self.assertEqual(len(hrm2_people), 1)

        person = hrm2_people[0]
        self.assertIsInstance(person, HRM2Person)
        self.assertEqual(person.person_id, 0)

        # Verify SMPL params are in embedded document
        self.assertIsNotNone(person.smpl_params)
        self.assertIsInstance(person.smpl_params, SMPLParams)
        self.assertIsNotNone(person.smpl_params.body_pose)
        self.assertIsNotNone(person.smpl_params.betas)
        self.assertIsNotNone(person.smpl_params.global_orient)

        # Verify camera data
        self.assertIsNotNone(person.camera_weak_perspective)
        self.assertIsNotNone(person.camera_translation)

        # Verify 3D keypoints
        self.assertIsNotNone(person.keypoints_3d)

    def test_output_processor_with_mesh_export(self):
        """Test HRM2OutputProcessor with export_meshes=True to catch serialization bugs.

        This test specifically validates:
        1. Vertex data is stored in HRM2Person documents
        2. SMPL faces are returned for export
        3. The mesh export pipeline works end-to-end
        """
        import torch
        import numpy as np
        from fiftyone.utils.hrm2 import HRM2OutputProcessor, HRM2Person

        # Create mock SMPL model with faces
        mock_smpl = MockSMPL()
        mock_device = torch.device("cpu")

        # Create processor WITH mesh export enabled
        processor = HRM2OutputProcessor(
            smpl_model=mock_smpl,
            device=mock_device,
            export_meshes=True,
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
        labels = processor(outputs)

        # Verify output structure
        self.assertEqual(len(labels), 1)
        self.assertIsInstance(labels[0], dict)
        self.assertIn("hrm2_people", labels[0])
        self.assertIn("smpl_faces", labels[0])
        self.assertIn("frame_size", labels[0])

        # Verify HRM2Person has vertex data for mesh export
        hrm2_people = labels[0]["hrm2_people"]
        self.assertEqual(len(hrm2_people), 1)
        person = hrm2_people[0]
        self.assertIsInstance(person, HRM2Person)

        # CRITICAL: Verify vertex data is stored in HRM2Person
        self.assertIsNotNone(
            person.vertices,
            "vertices should not be None when export_meshes=True",
        )
        self.assertIsInstance(
            person.vertices,
            list,
            f"vertices should be a list, got {type(person.vertices)}",
        )
        self.assertEqual(
            len(person.vertices),
            6890,
            "SMPL mesh should have 6890 vertices",
        )

        # Verify SMPL faces are returned for export
        smpl_faces = labels[0]["smpl_faces"]
        self.assertIsNotNone(smpl_faces, "smpl_faces should not be None")

        # Verify frame_size is also set correctly
        frame_size = labels[0]["frame_size"]
        self.assertIsNotNone(frame_size)
        self.assertEqual(frame_size, [480, 640])


class HRM2ModelTests(HRM2TestBase):
    """Tests for HRM2Model class."""

    def test_download_model_validation(self):
        """Test that _download_model raises error when all loading methods are missing."""
        from fiftyone.utils.hrm2 import HRM2Model, HRM2ModelConfig

        # Create config without model_name, model_path, or entrypoint_fcn
        config_dict = {
            "smpl_model_path": self.mock_smpl_path,
        }

        config = HRM2ModelConfig(config_dict)

        # Create model instance (this will trigger _download_model)
        with self.assertRaises(ValueError) as cm:
            HRM2Model(config)

        self.assertIn("requires at least one of", str(cm.exception))
        self.assertIn("'model_name'", str(cm.exception))
        self.assertIn("'model_path'", str(cm.exception))
        self.assertIn("'entrypoint_fcn'", str(cm.exception))

    def test_download_model_with_model_path(self):
        """Test that _download_model succeeds when model_path is provided."""
        from fiftyone.utils.hrm2 import HRM2ModelConfig
        from unittest.mock import patch, MagicMock

        # Create config with model_path
        config_dict = {
            "model_path": "/tmp/hrm2_model.pth",
            "smpl_model_path": self.mock_smpl_path,
            "entrypoint_fcn": "fiftyone.utils.hrm2.load_hrm2_model",
        }

        config = HRM2ModelConfig(config_dict)

        # Mock the entrypoint and model loading
        with patch("fiftyone.utils.hrm2.load_hrm2_model") as mock_load:
            with patch("fiftyone.utils.hrm2.load_smpl_model") as mock_smpl:
                mock_load.return_value = MagicMock()
                mock_smpl.return_value = MagicMock()

                # This should not raise an error
                from fiftyone.utils.hrm2 import HRM2Model

                model = HRM2Model(config)
                self.assertIsNotNone(model)

    def test_download_model_with_entrypoint_only(self):
        """Test that _download_model succeeds when only entrypoint_fcn is provided."""
        from fiftyone.utils.hrm2 import HRM2ModelConfig
        from unittest.mock import patch, MagicMock

        # Create config with only entrypoint_fcn (no model_name or model_path)
        config_dict = {
            "smpl_model_path": self.mock_smpl_path,
            "entrypoint_fcn": "fiftyone.utils.hrm2.load_hrm2_model",
        }

        config = HRM2ModelConfig(config_dict)

        # Mock the entrypoint and model loading
        with patch("fiftyone.utils.hrm2.load_hrm2_model") as mock_load:
            with patch("fiftyone.utils.hrm2.load_smpl_model") as mock_smpl:
                mock_load.return_value = MagicMock()
                mock_smpl.return_value = MagicMock()

                # This should not raise an error - entrypoint_fcn is sufficient
                from fiftyone.utils.hrm2 import HRM2Model

                model = HRM2Model(config)
                self.assertIsNotNone(model)

    def _create_mock_config(self, **kwargs):
        """Create a mock HRM2ModelConfig for testing."""
        from fiftyone.utils.hrm2 import HRM2ModelConfig

        config_dict = {
            "model_path": kwargs.get("model_path", "/tmp/hrm2_test_model.pth"),
            "smpl_model_path": kwargs.get("smpl_model_path", None),
            "checkpoint_version": kwargs.get("checkpoint_version", "2.0b"),
            "export_meshes": kwargs.get("export_meshes", False),
            "entrypoint_fcn": "fiftyone.utils.hrm2.load_hrm2_model",
        }

        return HRM2ModelConfig(config_dict)

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
        _mock_load,
        _mock_exists,
        _mock_resolve_config,
        _mock_get_checkpoint,
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
        self,
        _mock_load,
        _mock_exists,
        _mock_resolve_config,
        _mock_get_checkpoint,
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

        # Mock the _inference_with_detections method (single-person fallback)
        with patch.object(
            model, "_inference_with_detections"
        ) as mock_inference:
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

        # Result should be a dict with new label types
        from fiftyone.utils.hrm2 import HRM2Person, SMPLParams
        from fiftyone.core.labels import Keypoints

        self.assertIsInstance(result, dict)
        self.assertIn("keypoints", result)
        self.assertIn("hrm2_people", result)

        # Verify Keypoints structure
        keypoints = result["keypoints"]
        self.assertIsInstance(keypoints, Keypoints)

        # Verify HRM2Person structure
        hrm2_people = result["hrm2_people"]
        self.assertIsInstance(hrm2_people, list)
        self.assertEqual(len(hrm2_people), 1)

        # Verify the HRM2Person document has expected fields
        person = hrm2_people[0]
        self.assertIsInstance(person, HRM2Person)
        self.assertIsNotNone(person.smpl_params)
        self.assertIsInstance(person.smpl_params, SMPLParams)
        self.assertIsNotNone(person.keypoints_3d)
        self.assertEqual(person.person_id, 0)

    def test_inference_single_person_uses_shared_preprocessor(self):
        """Ensure single-person inference uses shared ViTDet preprocessing."""
        from fiftyone.utils.hrm2 import HRM2Model
        from fiftyone.utils.torch import get_target_size

        model = object.__new__(HRM2Model)
        model.config = SimpleNamespace(
            confidence_thresh=None,
            use_half_precision=False,
        )
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
                with patch.object(model, "_run_model", return_value=outputs):
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
                                result = model._inference_with_detections(
                                    test_img, None
                                )

        self.assertEqual(mock_preprocessor.call_count, 1)
        args, kwargs = mock_preprocessor.call_args
        self.assertEqual(kwargs, {})
        self.assertEqual(len(args), 2)
        np.testing.assert_array_equal(args[0], test_img)
        np.testing.assert_array_equal(
            args[1], np.array([0.0, 0.0, 640.0, 480.0], dtype=np.float32)
        )

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
        """Test single-person path via _inference_with_detections (fallback full image)."""
        import torch
        from fiftyone.utils.hrm2 import HRM2Model

        # Setup model with minimal mocking
        model = object.__new__(HRM2Model)
        model.config = SimpleNamespace(
            confidence_thresh=None,
            use_half_precision=False,
        )
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

        result = model._inference_with_detections(test_img, None)

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
        self.assertIsNotNone(person["bbox"])  # fallback full-image box

        # Verify camera_translation was computed (not None)
        self.assertIn("camera_translation", person)
        self.assertIsNotNone(person["camera_translation"])

    def test_build_get_item_simplified(self):
        """Test that build_get_item simply returns HRM2GetItem without auto-configuration."""
        from fiftyone.utils.hrm2 import HRM2Model, HRM2GetItem

        # Create a minimal model instance
        model = object.__new__(HRM2Model)
        model._transforms = None

        # Test with no field_mapping
        get_item = model.build_get_item(field_mapping=None)
        self.assertIsInstance(get_item, HRM2GetItem)
        self.assertEqual(get_item.required_keys, ["filepath", "prompt_field"])

        # Test with explicit field_mapping
        field_mapping = {"prompt_field": "my_detections"}
        get_item = model.build_get_item(field_mapping=field_mapping)
        self.assertIsInstance(get_item, HRM2GetItem)
        self.assertEqual(get_item.required_keys, ["filepath", "prompt_field"])

        # Test that transform is passed through
        def mock_transform(x):
            return x

        model._transforms = mock_transform
        get_item = model.build_get_item()
        self.assertEqual(get_item.transform, mock_transform)

    def test_collate_fn_handles_detections_objects(self):
        """Test that HRM2Model.collate_fn handles batches with fol.Detections objects.

        This test verifies that the custom collate_fn properly handles structured
        inputs from HRM2GetItem, which may contain fol.Detections objects that
        PyTorch's default_collate cannot handle.

        Without the custom collate_fn, DataLoader would raise:
        "batch must contain tensors, numpy arrays, numbers, dicts or lists;
        found <class 'fiftyone.core.labels.Detections'>"
        """
        from fiftyone.utils.hrm2 import HRM2Model
        import fiftyone.core.labels as fol

        # Verify has_collate_fn property returns True
        model = object.__new__(HRM2Model)
        self.assertTrue(model.has_collate_fn)

        # Create mock batch data similar to what HRM2GetItem would return
        # Each batch item is a dict with image data and detections
        mock_detection1 = fol.Detection(
            label="person", bounding_box=[0.1, 0.2, 0.3, 0.4], confidence=0.95
        )
        mock_detection2 = fol.Detection(
            label="person", bounding_box=[0.5, 0.3, 0.2, 0.5], confidence=0.85
        )

        batch = [
            {
                "image": np.random.randint(
                    0, 255, (256, 256, 3), dtype=np.uint8
                ),
                "detections": fol.Detections(detections=[mock_detection1]),
                "filepath": "/path/to/image1.jpg",
            },
            {
                "image": np.random.randint(
                    0, 255, (256, 256, 3), dtype=np.uint8
                ),
                "detections": fol.Detections(detections=[mock_detection2]),
                "filepath": "/path/to/image2.jpg",
            },
        ]

        # Call collate_fn - should pass through unchanged
        result = HRM2Model.collate_fn(batch)

        # Verify result is the same as input (pass-through behavior)
        self.assertIs(result, batch)
        self.assertEqual(len(result), 2)

        # Verify structure is preserved with fol.Detections objects intact
        self.assertIsInstance(result[0]["detections"], fol.Detections)
        self.assertIsInstance(result[1]["detections"], fol.Detections)
        self.assertEqual(len(result[0]["detections"].detections), 1)
        self.assertEqual(len(result[1]["detections"].detections), 1)

        # Verify detection data is preserved
        self.assertEqual(result[0]["detections"].detections[0].label, "person")
        self.assertEqual(
            result[0]["detections"].detections[0].confidence, 0.95
        )


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


class HMR2SkeletonTests(unittest.TestCase):
    """Tests for HRM2 (BODY-25) skeleton definition and integration."""

    def test_skeleton_structure(self):
        """Test the BODY-25 skeleton has correct structure."""
        from fiftyone.utils.hrm2 import (
            get_hrm2_skeleton,
            HRM2_JOINT_NAMES,
            HRM2_SKELETON_EDGES,
        )

        skeleton = get_hrm2_skeleton()

        # Verify we have 25 joints
        self.assertEqual(len(skeleton.labels), 25)
        self.assertEqual(len(HRM2_JOINT_NAMES), 25)

        # Verify we have 24 edges
        self.assertEqual(len(skeleton.edges), 24)
        self.assertEqual(len(HRM2_SKELETON_EDGES), 24)

        # Verify all edge indices are valid
        for edge in skeleton.edges:
            self.assertEqual(len(edge), 2)
            self.assertGreaterEqual(edge[0], 0)
            self.assertLess(edge[0], 25)
            self.assertGreaterEqual(edge[1], 0)
            self.assertLess(edge[1], 25)

    def test_skeleton_root(self):
        """Test neck (joint 1) connects to expected neighbors."""
        from fiftyone.utils.hrm2 import HRM2_SKELETON_EDGES

        # Gather all edges touching the neck (joint 1)
        neck_neighbors = set()
        for a, b in HRM2_SKELETON_EDGES:
            if a == 1:
                neck_neighbors.add(b)
            elif b == 1:
                neck_neighbors.add(a)

        expected_neighbors = {0, 2, 5, 8}  # nose, shoulders, mid_hip
        self.assertEqual(neck_neighbors, expected_neighbors)

    def test_skeleton_connectivity(self):
        """Test skeleton forms a connected tree."""
        from fiftyone.utils.hrm2 import HRM2_SKELETON_EDGES

        # Build adjacency list
        graph = {i: [] for i in range(25)}
        for parent, child in HRM2_SKELETON_EDGES:
            graph[parent].append(child)
            graph[child].append(parent)

        # BFS from neck (1) should reach all nodes
        visited = {1}
        queue = [1]
        while queue:
            node = queue.pop(0)
            for neighbor in graph[node]:
                if neighbor not in visited:
                    visited.add(neighbor)
                    queue.append(neighbor)

        self.assertEqual(len(visited), 25)

    def test_skeleton_labels(self):
        """Test skeleton has expected BODY-25 joint labels."""
        from fiftyone.utils.hrm2 import get_hrm2_skeleton

        expected_labels = [
            "nose",
            "neck",
            "right_shoulder",
            "right_elbow",
            "right_wrist",
            "left_shoulder",
            "left_elbow",
            "left_wrist",
            "mid_hip",
            "right_hip",
            "right_knee",
            "right_ankle",
            "left_hip",
            "left_knee",
            "left_ankle",
            "right_eye",
            "left_eye",
            "right_ear",
            "left_ear",
            "left_big_toe",
            "left_small_toe",
            "left_heel",
            "right_big_toe",
            "right_small_toe",
            "right_heel",
        ]

        skeleton = get_hrm2_skeleton()
        self.assertEqual(skeleton.labels, expected_labels)

    @drop_datasets
    def test_dataset_skeleton_assignment(self):
        """Test skeleton can be assigned to dataset."""
        from fiftyone.utils.hrm2 import get_hrm2_skeleton

        dataset = fo.Dataset()
        skeleton = get_hrm2_skeleton()

        dataset.default_skeleton = skeleton
        dataset.save()

        dataset.reload()
        self.assertIsNotNone(dataset.default_skeleton)
        self.assertEqual(len(dataset.default_skeleton.labels), 25)
        self.assertEqual(len(dataset.default_skeleton.edges), 24)
        self.assertEqual(dataset.default_skeleton.labels[0], "nose")
        self.assertEqual(dataset.default_skeleton.labels[8], "mid_hip")

    @drop_datasets
    def test_skeleton_with_keypoints(self):
        """Test skeleton is compatible with HRM2 keypoint format."""
        from fiftyone.utils.hrm2 import get_hrm2_skeleton, HRM2_JOINT_NAMES
        import tempfile

        dataset = fo.Dataset()

        img_path = tempfile.mktemp(suffix=".jpg")
        img = np.random.randint(0, 255, (480, 640, 3), dtype=np.uint8)
        Image.fromarray(img).save(img_path)

        num_joints = len(HRM2_JOINT_NAMES)
        keypoints = [
            [np.random.random(), np.random.random()] for _ in range(num_joints)
        ]
        confidences = [0.9] * num_joints

        sample = fo.Sample(filepath=img_path)
        sample["keypoints"] = fo.Keypoint(
            label="person",
            points=keypoints,
            confidence=confidences,
        )
        dataset.add_sample(sample)

        dataset.default_skeleton = get_hrm2_skeleton()
        dataset.save()

        skeleton = dataset.default_skeleton
        keypoint = dataset.first().keypoints
        self.assertEqual(len(keypoint.points), len(skeleton.labels))

        os.remove(img_path)

    @drop_datasets
    def test_skeleton_with_multiple_people(self):
        """Test skeleton works with multiple keypoint instances."""
        from fiftyone.utils.hrm2 import get_hrm2_skeleton, HRM2_JOINT_NAMES
        import tempfile

        dataset = fo.Dataset()

        img_path = tempfile.mktemp(suffix=".jpg")
        img = np.random.randint(0, 255, (480, 640, 3), dtype=np.uint8)
        Image.fromarray(img).save(img_path)

        sample = fo.Sample(filepath=img_path)

        num_joints = len(HRM2_JOINT_NAMES)
        keypoints_list = []
        for _ in range(3):
            kpts = [
                [np.random.random(), np.random.random()]
                for _ in range(num_joints)
            ]
            keypoints_list.append(
                fo.Keypoint(
                    label="person", points=kpts, confidence=[0.9] * num_joints
                )
            )

        sample["people_keypoints"] = fo.Keypoints(keypoints=keypoints_list)
        dataset.add_sample(sample)

        dataset.default_skeleton = get_hrm2_skeleton()
        dataset.save()

        sample.reload()
        self.assertEqual(len(sample.people_keypoints.keypoints), 3)
        self.assertIsNotNone(dataset.default_skeleton)

        os.remove(img_path)

    def test_skeleton_no_disconnected_joints(self):
        """Test that all joints are connected (no isolated nodes)."""
        from fiftyone.utils.hrm2 import HRM2_SKELETON_EDGES

        joint_connections = {i: 0 for i in range(25)}
        for parent, child in HRM2_SKELETON_EDGES:
            joint_connections[parent] += 1
            joint_connections[child] += 1

        for joint_id, count in joint_connections.items():
            self.assertGreater(
                count,
                0,
                f"Joint {joint_id} is disconnected (appears in 0 edges)",
            )

    def test_skeleton_symmetry(self):
        """Test that left/right side joints are symmetric in naming."""
        from fiftyone.utils.hrm2 import HRM2_JOINT_NAMES

        left_joints = [name for name in HRM2_JOINT_NAMES if "left" in name]
        for left in left_joints:
            right = left.replace("left", "right")
            self.assertIn(
                right, HRM2_JOINT_NAMES, f"No right counterpart for {left}"
            )

    def test_apply_hrm2_sets_skeleton(self):
        """Test that apply_hrm2_to_dataset_as_groups sets skeleton automatically."""
        from fiftyone.utils.hrm2 import get_hrm2_skeleton

        skeleton = get_hrm2_skeleton()
        self.assertIsNotNone(skeleton)
        self.assertEqual(len(skeleton.labels), 25)
        self.assertEqual(len(skeleton.edges), 24)

        # The actual apply_hrm2_to_dataset_as_groups workflow is tested elsewhere


if __name__ == "__main__":
    unittest.main()
