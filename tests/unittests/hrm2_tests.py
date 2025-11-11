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
        self.assertTrue(config.enable_multi_person)
        self.assertEqual(config.detector_type, "vitdet")
        self.assertEqual(config.detection_score_thresh, 0.5)

    def test_hrm2_config_custom_parameters(self):
        """Test HRM2Config with custom parameters."""
        from fiftyone.utils.hrm2 import HRM2Config

        mesh_dir = os.path.join(self.root_dir, "meshes")
        config_dict = {
            "smpl_model_path": self.mock_smpl_path,
            "checkpoint_version": "1.0",
            "export_meshes": False,
            "mesh_output_dir": mesh_dir,
            "enable_multi_person": False,
            "detector_type": "regnety",
            "detection_score_thresh": 0.7,
        }

        config = HRM2Config(config_dict)

        self.assertEqual(config.checkpoint_version, "1.0")
        self.assertFalse(config.export_meshes)
        self.assertEqual(config.mesh_output_dir, mesh_dir)
        self.assertFalse(config.enable_multi_person)
        self.assertEqual(config.detector_type, "regnety")
        self.assertEqual(config.detection_score_thresh, 0.7)

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


class HRM2UtilityTests(unittest.TestCase):
    """Tests for HRM2 utility functions."""

    def test_numpy_to_python_scalar(self):
        """Test numpy scalar conversion."""
        from fiftyone.utils.hrm2 import _numpy_to_python

        # Test float types
        result = _numpy_to_python(np.float32(3.14))
        self.assertIsInstance(result, float)
        self.assertAlmostEqual(result, 3.14, places=5)

        result = _numpy_to_python(np.float64(2.71))
        self.assertIsInstance(result, float)

        # Test int types
        result = _numpy_to_python(np.int32(42))
        self.assertIsInstance(result, int)
        self.assertEqual(result, 42)

        result = _numpy_to_python(np.int64(100))
        self.assertIsInstance(result, int)

    def test_numpy_to_python_array(self):
        """Test numpy array conversion."""
        from fiftyone.utils.hrm2 import _numpy_to_python

        arr = np.array([1.0, 2.0, 3.0], dtype=np.float32)
        result = _numpy_to_python(arr)

        self.assertIsInstance(result, list)
        self.assertEqual(result, [1.0, 2.0, 3.0])

    def test_numpy_to_python_nested_dict(self):
        """Test nested dictionary with numpy types."""
        from fiftyone.utils.hrm2 import _numpy_to_python

        data = {
            "float_val": np.float32(1.5),
            "int_val": np.int64(42),
            "array": np.array([1, 2, 3]),
            "nested": {"value": np.float64(2.5)},
        }

        result = _numpy_to_python(data)

        self.assertIsInstance(result["float_val"], float)
        self.assertIsInstance(result["int_val"], int)
        self.assertIsInstance(result["array"], list)
        self.assertIsInstance(result["nested"]["value"], float)

    def test_numpy_to_python_list(self):
        """Test list with numpy types."""
        from fiftyone.utils.hrm2 import _numpy_to_python

        data = [np.float32(1.0), np.int32(2), np.array([3, 4])]
        result = _numpy_to_python(data)

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
            "enable_multi_person": kwargs.get("enable_multi_person", False),
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
    def test_hrm2_model_initialization(
        self, mock_load, mock_exists, mock_resolve_config, mock_get_checkpoint
    ):
        """Test HRM2Model initialization with mocked dependencies."""
        import fiftyone.utils.hrm2 as hrm2_module
        from hmr2.configs import get_config
        from hmr2.models import HMR2

        # Setup mock config
        mock_cfg = MagicMock()
        mock_cfg.SMPL.MODEL_PATH = "/tmp/smpl"
        mock_cfg.SMPL.MEAN_PARAMS = "/tmp/smpl_mean_params.npz"
        mock_cfg.SMPL.JOINT_REGRESSOR_EXTRA = "/tmp/J_regressor_extra.npy"
        get_config.return_value = mock_cfg

        # Setup mock HMR2 model
        mock_hmr2_instance = MockHMR2Model(mock_cfg)
        HMR2.return_value = mock_hmr2_instance

        config = self._create_mock_config()
        model = hrm2_module.HRM2Model(config)

        self.assertIsNotNone(model)
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

        # Mock the prediction
        with patch.object(model, "_predict_all") as mock_predict:
            mock_predict.return_value = [
                {
                    "people": [
                        {
                            "smpl_params": {
                                "body_pose": [[0.1] * 3] * 23,
                                "betas": [0.0] * 10,
                                "global_orient": [[0.0] * 3],
                                "camera": [2.0, 0.0, 0.0],
                            },
                            "keypoints_3d": [[0.0, 0.0, 0.0]] * 24,
                            "keypoints_2d": [[100.0, 100.0]] * 24,
                            "bbox": None,
                            "person_id": 0,
                        }
                    ],
                    "scene_path": None,
                }
            ]

            result = model.predict(img)

        self.assertIsNotNone(result)
        self.assertIn("people", result)
        self.assertEqual(len(result["people"]), 1)

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
    def test_hrm2_model_multi_person_mode(
        self, mock_load, mock_exists, mock_resolve_config, mock_get_checkpoint
    ):
        """Test HRM2Model initialization with multi-person detection enabled."""
        from fiftyone.utils.hrm2 import HRM2Model, PersonDetectorConfig
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

        # Mock PersonDetectorConfig to avoid needing real detector setup
        with patch(
            "fiftyone.utils.hrm2.PersonDetectorConfig"
        ) as mock_detector_config_class:
            mock_detector_config = MagicMock()
            mock_detector_config.entrypoint_fcn = (
                lambda **kwargs: MockDetectron2Predictor()
            )
            mock_detector_config.entrypoint_args = {}
            mock_detector_config.score_thresh = 0.5
            mock_detector_config.detector_type = "vitdet"
            mock_detector_config_class.return_value = mock_detector_config

            config = self._create_mock_config(enable_multi_person=True)
            model = HRM2Model(config)

            self.assertIsNotNone(model._person_detector)


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

    @drop_datasets
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
    def test_hrm2_apply_to_dataset_as_groups(
        self, mock_load, mock_exists, mock_resolve_config, mock_get_checkpoint
    ):
        """Test applying HRM2 model to dataset and creating groups."""
        from fiftyone.utils.hrm2 import HRM2Model, HRM2Config
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

        config = HRM2Config(
            {
                "model_path": "/tmp/hrm2_test_model.pth",
                "smpl_model_path": None,
                "export_meshes": False,
                "enable_multi_person": False,
            }
        )
        model = HRM2Model(config)
        model._hmr2 = mock_hmr2_instance

        dataset = self._make_dataset()

        # Mock _predict_all to return test predictions
        with patch.object(model, "_predict_all") as mock_predict:
            mock_predict.return_value = [
                {
                    "people": [
                        {
                            "smpl_params": {
                                "body_pose": [[0.1] * 3] * 23,
                                "betas": [0.0] * 10,
                                "global_orient": [[0.0] * 3],
                                "camera": [2.0, 0.0, 0.0],
                            },
                            "keypoints_3d": [[0.0, 0.0, 0.0]] * 24,
                            "keypoints_2d": [[100.0, 100.0]] * 24,
                            "bbox": [50.0, 50.0, 150.0, 200.0],
                            "person_id": 0,
                        }
                    ],
                    "scene_path": None,
                }
            ] * 3

            result_dataset = model.apply_to_dataset_as_groups(
                dataset, label_field="human_pose", batch_size=1
            )

        # Dataset should be converted to grouped format
        self.assertEqual(result_dataset.media_type, "group")
        self.assertGreater(len(result_dataset), 0)


class HumanPoseLabelTests(HRM2TestBase):
    """Tests for HumanPose2D and HumanPose3D label classes."""

    @drop_datasets
    def test_human_pose_2d_creation(self):
        """Test HumanPose2D label creation."""
        from fiftyone.utils.hrm2 import HumanPose2D

        keypoints = [[100.0, 150.0], [120.0, 170.0], [110.0, 180.0]]
        confidence = [0.9, 0.85, 0.92]
        bbox = [90.0, 140.0, 50.0, 60.0]

        label = HumanPose2D(
            keypoints=keypoints, confidence=confidence, bounding_box=bbox
        )

        self.assertEqual(label.keypoints, keypoints)
        self.assertEqual(label.confidence, confidence)
        self.assertEqual(label.bounding_box, bbox)

    @drop_datasets
    def test_human_pose_2d_serialization(self):
        """Test saving and loading HumanPose2D from dataset."""
        from fiftyone.utils.hrm2 import HumanPose2D

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

    @drop_datasets
    def test_human_pose_3d_creation(self):
        """Test HumanPose3D label creation."""
        from fiftyone.utils.hrm2 import HumanPose3D

        people_data = [
            {
                "smpl_params": {
                    "body_pose": [[0.1] * 3] * 23,
                    "betas": [0.0] * 10,
                    "global_orient": [[0.0] * 3],
                    "camera": [2.0, 0.0, 0.0],
                },
                "keypoints_3d": [[0.0, 0.0, 0.0]] * 24,
                "person_id": 0,
            }
        ]

        label = HumanPose3D(people=people_data, confidence=0.95)

        self.assertEqual(len(label.people), 1)
        self.assertEqual(label.confidence, 0.95)
        self.assertEqual(label.people[0]["person_id"], 0)

    @drop_datasets
    def test_human_pose_3d_multi_person(self):
        """Test HumanPose3D with multiple people."""
        from fiftyone.utils.hrm2 import HumanPose3D

        people_data = [
            {
                "smpl_params": {
                    "body_pose": [],
                    "betas": [],
                    "global_orient": [],
                },
                "keypoints_3d": [[0.0, 0.0, 0.0]] * 24,
                "person_id": 0,
            },
            {
                "smpl_params": {
                    "body_pose": [],
                    "betas": [],
                    "global_orient": [],
                },
                "keypoints_3d": [[1.0, 1.0, 1.0]] * 24,
                "person_id": 1,
            },
        ]

        label = HumanPose3D(people=people_data)

        self.assertEqual(len(label.people), 2)
        self.assertEqual(label.people[0]["person_id"], 0)
        self.assertEqual(label.people[1]["person_id"], 1)

    @drop_datasets
    def test_human_pose_3d_serialization(self):
        """Test saving and loading HumanPose3D from dataset."""
        from fiftyone.utils.hrm2 import HumanPose3D

        dataset = fo.Dataset()
        sample = fo.Sample(filepath=self._new_image())

        people_data = [
            {
                "smpl_params": {"body_pose": [1.0] * 69, "betas": [0.0] * 10},
                "keypoints_3d": [[0.0, 0.0, 0.0]] * 24,
                "person_id": 0,
            }
        ]

        label = HumanPose3D(people=people_data, confidence=0.9)
        sample["pose_3d"] = label

        dataset.add_sample(sample)

        # Retrieve and verify
        retrieved = dataset.first()
        self.assertIsNotNone(retrieved["pose_3d"])
        self.assertEqual(len(retrieved["pose_3d"].people), 1)
        self.assertEqual(retrieved["pose_3d"].confidence, 0.9)


class PersonDetectorTests(HRM2TestBase):
    """Tests for PersonDetector class."""

    def test_person_detector_vitdet_initialization(self):
        """Test PersonDetector initialization with ViTDet."""
        from fiftyone.utils.hrm2 import PersonDetector, PersonDetectorConfig

        config_dict = {
            "model_path": "/tmp/person_detector_vitdet_test.pth",
            "detector_type": "vitdet",
            "score_thresh": 0.6,
        }
        config = PersonDetectorConfig(config_dict)

        # Mock the entrypoint function
        mock_detector_instance = MockDetectron2Predictor()
        with patch.object(
            config, "entrypoint_fcn", return_value=mock_detector_instance
        ):
            detector = PersonDetector(config)

        self.assertEqual(detector.score_thresh, 0.6)
        self.assertEqual(detector.detector_type, "vitdet")
        self.assertIsNotNone(detector._detector)

    def test_person_detector_regnety_initialization(self):
        """Test PersonDetector initialization with RegNetY."""
        from fiftyone.utils.hrm2 import PersonDetector, PersonDetectorConfig

        config_dict = {
            "model_path": "/tmp/person_detector_regnety_test.pth",
            "detector_type": "regnety",
            "score_thresh": 0.5,
        }
        config = PersonDetectorConfig(config_dict)

        # Mock the entrypoint function
        mock_detector_instance = MockDetectron2Predictor()
        with patch.object(
            config, "entrypoint_fcn", return_value=mock_detector_instance
        ):
            detector = PersonDetector(config)

        self.assertEqual(detector.score_thresh, 0.5)
        self.assertEqual(detector.detector_type, "regnety")
        self.assertIsNotNone(detector._detector)

    def test_person_detector_detect(self):
        """Test PersonDetector detection on an image."""
        from fiftyone.utils.hrm2 import PersonDetector, PersonDetectorConfig

        config_dict = {
            "model_path": "/tmp/person_detector_test.pth",
            "detector_type": "regnety",
            "score_thresh": 0.5,
        }
        config = PersonDetectorConfig(config_dict)

        # Mock the entrypoint function
        mock_detector_instance = MockDetectron2Predictor()
        with patch.object(
            config, "entrypoint_fcn", return_value=mock_detector_instance
        ):
            detector = PersonDetector(config)

        # Create test image (BGR format for OpenCV)
        img = np.random.randint(0, 255, size=(480, 640, 3), dtype=np.uint8)

        boxes = detector.detect(img)

        self.assertIsInstance(boxes, np.ndarray)
        self.assertEqual(
            boxes.shape[1], 4
        )  # Each box should have [x1, y1, x2, y2]
        self.assertEqual(len(boxes), 2)  # Mock returns 2 detections


if __name__ == "__main__":
    unittest.main()
