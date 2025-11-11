"""
HRM2.0 (4D-Humans) model integration.

| Copyright 2017-2025, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""

import logging
import os
import tempfile
from pathlib import Path
from typing import Optional, Dict, List, Tuple
import warnings

import numpy as np
from PIL import Image

import eta.core.utils as etau

import fiftyone as fo
import fiftyone.core.config as foc
import fiftyone.core.fields as fof
import fiftyone.core.labels as fol
import fiftyone.core.utils as fou
import fiftyone.utils.torch as fout
import fiftyone.zoo.models as fozm

fou.ensure_torch()
import torch

logger = logging.getLogger(__name__)

__all__ = [
    "load_hrm2_model",
    "load_smpl_model",
    "load_person_detector",
    "PersonDetectorConfig",
    "PersonDetector",
    "HRM2Config",
    "HRM2ModelConfig",
    "HRM2Model",
    "HumanPose2D",
    "HumanPose3D",
]


def _numpy_to_python(obj):
    """Recursively convert numpy types to Python native types.

    This is necessary for MongoDB/BSON serialization which doesn't support numpy types.
    """
    if isinstance(obj, np.ndarray):
        return obj.tolist()
    elif isinstance(obj, (np.floating, np.float32, np.float64)):
        return float(obj)
    elif isinstance(obj, (np.integer, np.int32, np.int64)):
        return int(obj)
    elif isinstance(obj, dict):
        return {k: _numpy_to_python(v) for k, v in obj.items()}
    elif isinstance(obj, (list, tuple)):
        return [_numpy_to_python(item) for item in obj]
    else:
        return obj


def cam_crop_to_full(pred_cam, box_center, box_size, img_size, focal_length):
    """Transform camera parameters from crop space to full image space.

    This function converts camera translation parameters predicted on image crops
    back to the coordinate system of the full image. This is necessary when
    processing multiple people detected at different locations in the image.

    Args:
        pred_cam: predicted camera parameters [s, tx, ty] where:
            - s: scale factor
            - tx, ty: translation in crop coordinates
        box_center: center of the bounding box [cx, cy] in image coordinates
        box_size: size of the bounding box (single scalar, assumed square)
        img_size: size of the full image [width, height]
        focal_length: camera focal length in pixels

    Returns:
        camera translation [tx, ty, tz] in full image coordinate system
    """
    # Extract components
    if isinstance(pred_cam, torch.Tensor):
        s, tx_crop, ty_crop = pred_cam[:, 0], pred_cam[:, 1], pred_cam[:, 2]
        cx, cy = box_center[:, 0], box_center[:, 1]
        img_w, img_h = img_size[:, 0], img_size[:, 1]
    else:
        s, tx_crop, ty_crop = pred_cam[0], pred_cam[1], pred_cam[2]
        cx, cy = box_center
        img_w, img_h = img_size

    # Image center
    w_2, h_2 = img_w / 2.0, img_h / 2.0

    # Compute depth from scale
    bs = box_size * s + 1e-9
    tz = 2 * focal_length / bs

    # Adjust translation for box offset from image center
    tx = (2 * (cx - w_2) / bs) + tx_crop
    ty = (2 * (cy - h_2) / bs) + ty_crop

    if isinstance(pred_cam, torch.Tensor):
        return torch.stack([tx, ty, tz], dim=-1)
    else:
        return np.array([tx, ty, tz])


def _resolve_hrm2_config_path(version: Optional[str] = None) -> str:
    """Resolve the HRM2 model config path for the given version.

    Args:
        version: checkpoint version string, or path to existing config file

    Returns:
        path to model_config.yaml file
    """
    if version and os.path.isfile(version):
        return version

    try:
        from hmr2.configs import CACHE_DIR_4DHUMANS
    except ImportError as exc:
        raise ImportError(
            "The 4D-Humans package is required to load HRM2 configs"
        ) from exc

    # Use FiftyOne's model zoo directory if available
    cache_dir = Path(fo.config.model_zoo_dir) / "4DHumans"
    if not cache_dir.exists():
        # Fallback to 4D-Humans default cache
        cache_dir = Path(CACHE_DIR_4DHUMANS)

    candidates = []

    if version:
        version_path = cache_dir / version / "model_config.yaml"
        candidates.append(version_path)
        candidates.append(
            cache_dir
            / "logs"
            / "train"
            / "multiruns"
            / "hmr2"
            / version
            / "model_config.yaml"
        )

    # Fallback to the default location shipped with download_models()
    candidates.append(
        cache_dir
        / "logs"
        / "train"
        / "multiruns"
        / "hmr2"
        / "0"
        / "model_config.yaml"
    )

    # As a last resort, search the cache for any model_config.yaml file
    if cache_dir.exists():
        candidates.extend(cache_dir.rglob("model_config.yaml"))

    for path in candidates:
        if isinstance(path, Path) and path.exists():
            return str(path)
        if isinstance(path, str) and os.path.exists(path):
            return path

    searched = [str(path) for path in candidates]
    raise FileNotFoundError(
        "Could not locate an HRM2 model_config.yaml. "
        "Ensure 4D-Humans assets are downloaded by running "
        '`python -c "from hmr2.models import download_models; download_models()"`. '
        f"Checked paths: {searched}"
    )


def _get_hrm2_checkpoint_path(version: Optional[str] = None) -> str:
    """Get the path to the HRM2 checkpoint.

    Args:
        version: checkpoint version string

    Returns:
        path to checkpoint file
    """
    # Use FiftyOne's model zoo directory if available
    cache_dir = Path(fo.config.model_zoo_dir) / "4DHumans"
    if not cache_dir.exists():
        # Fallback to 4D-Humans default cache
        cache_dir = Path(os.path.expanduser("~/.cache/4DHumans"))

    # Prefer version-specific .pth files if present
    if version:
        checkpoint_name = cache_dir / f"hmr2_{version}.pth"
        if checkpoint_name.exists():
            return str(checkpoint_name)

    def _find_ckpt(root: Path) -> Optional[Path]:
        if not root.exists():
            return None
        ckpts = sorted(root.glob("*.ckpt"))
        if ckpts:
            return ckpts[-1]
        return None

    candidate_dirs = []
    if version:
        candidate_dirs.append(
            cache_dir
            / "logs"
            / "train"
            / "multiruns"
            / "hmr2"
            / version
            / "checkpoints"
        )
    candidate_dirs.append(
        cache_dir
        / "logs"
        / "train"
        / "multiruns"
        / "hmr2"
        / "0"
        / "checkpoints"
    )

    for directory in candidate_dirs:
        ckpt_path = _find_ckpt(directory)
        if ckpt_path is not None:
            return str(ckpt_path)

    # Fallback to the versioned .pth path even if it does not yet exist
    fallback = (
        cache_dir / f"hmr2_{version}.pth"
        if version
        else cache_dir / "hmr2.pth"
    )
    return str(fallback)


def _load_hrm2_checkpoint(checkpoint_path: str) -> Dict:
    """Load an HRM2 checkpoint with compatibility for torch >= 2.6.

    PyTorch 2.6 switched the default of ``torch.load(..., weights_only=True)``,
    which restricts the pickled globals that can be deserialized. HRM2
    checkpoints include ``omegaconf.DictConfig`` objects, so we proactively
    allowlist them and gracefully fall back to the pre-2.6 behaviour when
    necessary.

    Args:
        checkpoint_path: path to checkpoint file

    Returns:
        checkpoint dictionary
    """
    load_kwargs = {"map_location": "cpu"}
    serialization = getattr(torch, "serialization", None)

    try:
        from omegaconf import DictConfig
    except Exception:
        DictConfig = None

    # Preferred path: use the safe_globals context manager introduced in torch 2.6
    safe_globals_ctx = (
        getattr(serialization, "safe_globals", None) if serialization else None
    )
    if safe_globals_ctx and DictConfig is not None:
        try:
            with safe_globals_ctx([DictConfig]):
                return torch.load(checkpoint_path, **load_kwargs)
        except Exception as e:
            logger.debug(
                "torch.load with safe_globals failed: %s. Falling back to weights_only=False",
                e,
            )

    # As a backup, register the class globally when supported
    add_safe_globals = (
        getattr(serialization, "add_safe_globals", None)
        if serialization
        else None
    )
    if add_safe_globals and DictConfig is not None:
        try:
            add_safe_globals([DictConfig])
        except Exception as e:
            logger.debug("torch.serialization.add_safe_globals failed: %s", e)

    # Final fallback: explicitly request full pickle loading (pre-2.6 behaviour)
    try:
        return torch.load(checkpoint_path, weights_only=False, **load_kwargs)
    except TypeError:
        # Older torch versions don't expose weights_only
        return torch.load(checkpoint_path, **load_kwargs)


def load_hrm2_model(
    checkpoint_version: str = "2.0b",
    checkpoint_path: Optional[str] = None,
    model_config_path: Optional[str] = None,
    init_renderer: bool = False,
    device: str = "cpu",
    **kwargs,
):
    """Entrypoint function for loading HRM2 models.

    This function handles the complete loading pipeline for HRM2 models,
    including config resolution, model instantiation, and checkpoint loading.

    Args:
        checkpoint_version: version of HRM2 checkpoint to use
        checkpoint_path: explicit path to checkpoint file (overrides version lookup)
        model_config_path: explicit path to model config (overrides version lookup)
        init_renderer: whether to initialize the renderer (should be False for headless)
        device: device to load model on
        **kwargs: additional arguments

    Returns:
        loaded HRM2 model
    """
    try:
        from hmr2.configs import get_config
        from hmr2.models import HMR2
    except ImportError as e:
        raise ImportError(
            f"Failed to import HRM2 dependencies: {e}. "
            f"Please install 4D-Humans from https://github.com/shubham-goel/4D-Humans"
        )

    # Resolve model config path
    if model_config_path is None:
        model_config_path = _resolve_hrm2_config_path(checkpoint_version)

    model_cfg = get_config(model_config_path, update_cachedir=True)
    logger.info(f"Using HRM2 model config at {model_config_path}")

    # Validate critical SMPL resources referenced by the config
    try:
        smpl_model_dir = getattr(model_cfg.SMPL, "MODEL_PATH", None)
        smpl_mean_params = getattr(model_cfg.SMPL, "MEAN_PARAMS", None)
        smpl_joint_reg = getattr(model_cfg.SMPL, "JOINT_REGRESSOR_EXTRA", None)
    except Exception:
        smpl_model_dir = smpl_mean_params = smpl_joint_reg = None

    missing = []
    if not smpl_mean_params or not os.path.exists(smpl_mean_params):
        missing.append(f"SMPL.MEAN_PARAMS -> {smpl_mean_params}")
    if not smpl_joint_reg or not os.path.exists(smpl_joint_reg):
        missing.append(f"SMPL.JOINT_REGRESSOR_EXTRA -> {smpl_joint_reg}")
    if not smpl_model_dir or not os.path.exists(smpl_model_dir):
        missing.append(f"SMPL.MODEL_PATH -> {smpl_model_dir}")

    if missing:
        raise FileNotFoundError(
            "Missing required 4D-Humans assets:\n  - " + "\n  - ".join(missing)
        )

    # Disable renderer to avoid EGL issues in headless/SSH environments
    model = HMR2(model_cfg, init_renderer=init_renderer)

    # Resolve checkpoint path if not explicitly provided
    if checkpoint_path is None:
        checkpoint_path = _get_hrm2_checkpoint_path(checkpoint_version)

    # Load checkpoint if it exists
    if os.path.exists(checkpoint_path):
        checkpoint = _load_hrm2_checkpoint(checkpoint_path)
        model.load_state_dict(checkpoint["state_dict"])
        logger.info(f"Loaded HRM2 checkpoint from {checkpoint_path}")
    else:
        logger.warning(
            f"Checkpoint not found at {checkpoint_path}. "
            f"Model will use random initialization."
        )

    return model


def load_smpl_model(smpl_model_path: str, device: str = "cpu", **kwargs):
    """Entrypoint function for loading SMPL models.

    Args:
        smpl_model_path: path to SMPL_NEUTRAL.pkl file
        device: device to load model on
        **kwargs: additional arguments

    Returns:
        loaded SMPL model
    """
    try:
        from smplx import SMPL
    except ImportError as e:
        raise ImportError(
            f"Failed to import SMPL dependencies: {e}. "
            f"Please install smplx: pip install smplx"
        )

    if not os.path.exists(smpl_model_path):
        raise ValueError(
            f"SMPL model not found at {smpl_model_path}. "
            f"Please register at https://smpl.is.tue.mpg.de/ to "
            f"obtain the SMPL_NEUTRAL.pkl file."
        )

    model = SMPL(
        model_path=os.path.dirname(smpl_model_path),
        gender="neutral",
        batch_size=1,
        create_transl=False,
    )
    logger.info(f"Loaded SMPL model from {smpl_model_path}")

    return model


def load_person_detector(
    detector_type: str = "vitdet",
    score_thresh: float = 0.5,
    device: str = "cuda",
    **kwargs,
):
    """Entrypoint function for loading Detectron2 person detectors.

    Args:
        detector_type: 'vitdet' (more accurate, default) or 'regnety' (faster)
        score_thresh: minimum confidence threshold for detections
        device: torch device to run detection on
        **kwargs: additional arguments

    Returns:
        loaded Detectron2 predictor
    """
    try:
        from detectron2.config import LazyConfig
        import hmr2
    except ImportError as e:
        raise ImportError(
            f"Failed to import Detectron2: {e}. "
            "Please install detectron2: "
            "pip install 'git+https://github.com/facebookresearch/detectron2.git'"
        )

    if detector_type == "vitdet":
        # Use ViTDet (more accurate)
        from hmr2.utils.utils_detectron2 import DefaultPredictor_Lazy

        cfg_path = (
            Path(hmr2.__file__).parent
            / "configs"
            / "cascade_mask_rcnn_vitdet_h_75ep.py"
        )

        if not cfg_path.exists():
            raise FileNotFoundError(
                f"ViTDet config not found at {cfg_path}. "
                "Please ensure 4D-Humans is properly installed."
            )

        detectron2_cfg = LazyConfig.load(str(cfg_path))
        detectron2_cfg.train.init_checkpoint = (
            "https://dl.fbaipublicfiles.com/detectron2/ViTDet/COCO/"
            "cascade_mask_rcnn_vitdet_h/f328730692/model_final_f05665.pkl"
        )

        # Set score threshold for all prediction heads
        for i in range(3):
            detectron2_cfg.model.roi_heads.box_predictors[
                i
            ].test_score_thresh = score_thresh

        detector = DefaultPredictor_Lazy(detectron2_cfg)
        logger.info("Loaded ViTDet person detector")

    else:
        # Use RegNetY (faster alternative)
        from detectron2 import model_zoo
        from detectron2.config import get_cfg
        from detectron2.engine import DefaultPredictor

        cfg = get_cfg()
        cfg.merge_from_file(
            model_zoo.get_config_file(
                "COCO-InstanceSegmentation/mask_rcnn_R_50_FPN_3x.yaml"
            )
        )
        cfg.MODEL.ROI_HEADS.SCORE_THRESH_TEST = score_thresh
        cfg.MODEL.WEIGHTS = model_zoo.get_checkpoint_url(
            "COCO-InstanceSegmentation/mask_rcnn_R_50_FPN_3x.yaml"
        )
        cfg.MODEL.DEVICE = str(device)

        detector = DefaultPredictor(cfg)
        logger.info("Loaded RegNetY person detector")

    return detector


class PersonDetectorConfig(fout.TorchImageModelConfig):
    """Configuration for :class:`PersonDetector`.

    Args:
        detector_type ("vitdet"): type of person detector to use. Options:
            "vitdet" (more accurate, default) or "regnety" (faster)
        score_thresh (0.5): minimum confidence score for person detections
        **kwargs: additional parameters for :class:`TorchImageModelConfig`
    """

    def __init__(self, d):
        self.detector_type = self.parse_string(
            d, "detector_type", default="vitdet"
        )
        self.score_thresh = self.parse_number(d, "score_thresh", default=0.5)

        # Set up entrypoint if not already configured
        if d.get("entrypoint_fcn") is None:
            d["entrypoint_fcn"] = load_person_detector

        if d.get("entrypoint_args") is None:
            d["entrypoint_args"] = {}

        # Ensure entrypoint args include detector config
        d["entrypoint_args"].update(
            {
                "detector_type": self.detector_type,
                "score_thresh": self.score_thresh,
            }
        )

        super().__init__(d)


class PersonDetector:
    """Detectron2-based person detector for multi-person HRM2 inference.

    This detector finds bounding boxes of all people in an image, which are
    then processed individually through the HRM2 model.
    """

    def __init__(self, config):
        """Initialize the person detector.

        Args:
            config: a :class:`PersonDetectorConfig`
        """
        self.config = config
        self._device = config.device if hasattr(config, "device") else "cuda"
        self.score_thresh = config.score_thresh
        self.detector_type = config.detector_type

        # Load detector using entrypoint
        entrypoint_fcn = config.entrypoint_fcn
        if isinstance(entrypoint_fcn, str):
            entrypoint_fcn = etau.get_function(entrypoint_fcn)

        entrypoint_args = config.entrypoint_args.copy()
        entrypoint_args["device"] = self._device

        self._detector = entrypoint_fcn(**entrypoint_args)

    def detect(self, img_cv2):
        """Detect all people in an image.

        Args:
            img_cv2: image in OpenCV format (BGR, HWC, uint8)

        Returns:
            numpy array of bounding boxes [[x1, y1, x2, y2], ...], one per detected person
        """
        # Run detection
        det_out = self._detector(img_cv2)
        instances = det_out["instances"]

        # Filter for person class (class 0 in COCO) with sufficient confidence
        valid_idx = (instances.pred_classes == 0) & (
            instances.scores > self.score_thresh
        )
        boxes = instances.pred_boxes.tensor[valid_idx].cpu().numpy()

        logger.debug(
            f"Detected {len(boxes)} people with confidence > {self.score_thresh}"
        )
        return boxes


class HRM2Config(fout.TorchImageModelConfig, fozm.HasZooModel):
    """Configuration for running an :class:`HRM2Model`.

    Args:
        smpl_model_path (None): path to the SMPL_NEUTRAL.pkl file. Users must
            register at https://smpl.is.tue.mpg.de/ to obtain this file
        checkpoint_version ("2.0b"): version of HRM2 checkpoint to use
        confidence_thresh (None): confidence threshold for keypoint filtering
        export_meshes (True): whether to export 3D meshes as OBJ files
        mesh_output_dir (None): directory to save mesh files. If None, uses
            temp directory
        enable_multi_person (True): whether to enable multi-person detection
            and processing. If True, uses Detectron2 to detect all people in
            each image and processes them separately
        detector_type ("vitdet"): type of person detector to use. Options:
            "vitdet" (more accurate, default) or "regnety" (faster)
        detection_score_thresh (0.5): minimum confidence score for person
            detections
        **kwargs: additional parameters for :class:`TorchImageModelConfig`
    """

    def __init__(self, d):
        # Initialize zoo model first (required for HasZooModel)
        d = self.init(d)

        # HRM2-specific parameters
        self.smpl_model_path = self.parse_string(
            d, "smpl_model_path", default=None
        )
        self.checkpoint_version = self.parse_string(
            d, "checkpoint_version", default="2.0b"
        )
        self.export_meshes = self.parse_bool(d, "export_meshes", default=True)
        self.mesh_output_dir = self.parse_string(
            d, "mesh_output_dir", default=None
        )

        # Multi-person detection parameters
        self.enable_multi_person = self.parse_bool(
            d, "enable_multi_person", default=True
        )
        self.detector_type = self.parse_string(
            d, "detector_type", default="vitdet"
        )
        self.detection_score_thresh = self.parse_number(
            d, "detection_score_thresh", default=0.5
        )

        # Set up HRM2 model entrypoint if not already configured
        if d.get("entrypoint_fcn") is None:
            d["entrypoint_fcn"] = load_hrm2_model

        if d.get("entrypoint_args") is None:
            d["entrypoint_args"] = {}

        # Ensure entrypoint args include HRM2 config
        d["entrypoint_args"].update(
            {
                "checkpoint_version": self.checkpoint_version,
                "checkpoint_path": d.get(
                    "checkpoint_path"
                ),  # Allow explicit override
                "model_config_path": d.get(
                    "model_config_path"
                ),  # Allow explicit override
                "init_renderer": False,
            }
        )

        super().__init__(d)

        # Validate SMPL model path
        if self.smpl_model_path is not None:
            if not os.path.exists(self.smpl_model_path):
                raise ValueError(
                    f"SMPL model not found at {self.smpl_model_path}. "
                    f"Please register at https://smpl.is.tue.mpg.de/ to "
                    f"obtain the SMPL_NEUTRAL.pkl file."
                )


class HRM2ModelConfig(HRM2Config):
    """Compatibility alias so the zoo loader can resolve the config class.

    Some loaders expect the config class to be named `<ModelClassName>Config`.
    """

    pass


class HRM2Model(fout.TorchImageModel):
    """Wrapper for evaluating HRM2.0 (4D-Humans) on images.

    HRM2.0 performs 3D human mesh reconstruction from single images, outputting
    SMPL body model parameters, 3D meshes, and keypoints.

    Args:
        config: an :class:`HRM2Config`
    """

    def __init__(self, config):
        self._hmr2 = None
        self._smpl = None
        self._person_detector = None
        self._mesh_output_dir = config.mesh_output_dir
        if self._mesh_output_dir is None:
            self._mesh_output_dir = tempfile.mkdtemp(prefix="hrm2_meshes_")

        super().__init__(config)

        # Initialize person detector if multi-person mode is enabled
        if config.enable_multi_person:
            # Create PersonDetectorConfig
            detector_config_dict = {
                "detector_type": config.detector_type,
                "score_thresh": config.detection_score_thresh,
                "device": str(self._device),
            }
            detector_config = PersonDetectorConfig(detector_config_dict)
            self._person_detector = PersonDetector(detector_config)
            logger.info(
                f"Multi-person detection enabled with {config.detector_type} "
                f"(score_thresh={config.detection_score_thresh})"
            )

    def _download_model(self, config):
        """Download model if it's a zoo model."""
        # Download via zoo if HasZooModel is available and model identifiers are provided
        if hasattr(config, "download_model_if_necessary"):
            model_name = getattr(config, "model_name", None)
            model_path = getattr(config, "model_path", None)
            if model_name or model_path:
                config.download_model_if_necessary()
        # Note: HRM2 uses 4D-Humans' own download mechanism via entrypoint
        # The checkpoint paths are resolved in the load_hrm2_model() entrypoint function

    def _load_model(self, config):
        """Load the HRM2 model and SMPL body model."""
        # Load HRM2 model using parent's entrypoint mechanism
        self._hmr2 = super()._load_model(config)

        # Load SMPL model separately if configured
        if config.smpl_model_path:
            self._smpl = load_smpl_model(
                smpl_model_path=config.smpl_model_path,
                device=str(self._device),
            )

            # Apply device and precision settings to SMPL
            self._smpl = self._smpl.to(self._device)
            if self.config.use_half_precision:
                self._smpl = self._smpl.half()
            self._smpl.eval()
        else:
            logger.warning(
                "No SMPL model path provided. 3D mesh generation will not be "
                "available. Please provide smpl_model_path in config."
            )

        return self._hmr2

    def predict(self, img):
        """Performs HRM2 prediction on the given image.

        Args:
            img: the image to process, which can be any of the following:
                - A PIL image
                - A uint8 numpy array (HWC)
                - A Torch tensor (CHW)

        Returns:
            a dictionary containing prediction data
        """
        return super().predict(img)

    def apply_to_dataset_as_groups(
        self,
        dataset,
        label_field="human_pose",
        batch_size=1,
        num_workers=4,
        image_slice_name="image",
        scene_slice_name="3d",
    ):
        """Apply HRM2 model to a dataset and create grouped samples.

        This method converts an image dataset into a grouped dataset where each
        group contains:
        - An image slice with the original image and 2D keypoints
        - A 3D slice with the reconstructed mesh scene and 3D data

        Args:
            dataset: the FiftyOne dataset to process
            label_field (str): base name for label fields (will create
                "{label_field}_2d" on image samples and "{label_field}_3d" on
                scene samples)
            batch_size (int): batch size for inference
            num_workers (int): number of workers for data loading
            image_slice_name (str): name for the image slice in groups
            scene_slice_name (str): name for the 3D scene slice in groups

        Returns:
            the grouped dataset
        """
        import fiftyone as fo

        # Check if dataset is already grouped
        if dataset.media_type == "group":
            logger.warning(
                "Dataset is already grouped. This will add new slices to "
                "existing groups."
            )
            # For already grouped datasets, we just process existing samples
            is_already_grouped = True
        else:
            is_already_grouped = False

        # Process samples with progress tracking
        logger.info(f"Processing {len(dataset)} samples...")

        # Collect samples and images for batch processing
        samples_list = list(dataset.iter_samples())
        images = []
        for sample in samples_list:
            img = Image.open(sample.filepath)
            images.append(img)

        # Process in batches
        all_predictions = []
        for i in range(0, len(images), batch_size):
            batch_imgs = images[i : i + batch_size]
            batch_preds = self._predict_all(batch_imgs, start_idx=i)
            all_predictions.extend(batch_preds)

        # Create grouped samples
        logger.info("Creating grouped dataset structure...")

        # Store original sample info
        original_data = []
        for sample in samples_list:
            original_data.append(
                {
                    "filepath": sample.filepath,
                    "id": sample.id,
                    "fields": {
                        k: sample[k]
                        for k in sample.field_names
                        if k
                        not in ["id", "filepath", "metadata", "_media_type"]
                    },
                }
            )

        # Clear the dataset to rebuild with groups
        logger.info("Clearing dataset to rebuild with groups...")
        dataset.clear()

        # Set up the dataset for groups
        dataset.add_group_field("group", default=image_slice_name)

        # Create all new samples with groups
        all_new_samples = []

        for idx, (orig_data, pred) in enumerate(
            zip(original_data, all_predictions)
        ):
            # Create group
            group = fo.Group()

            # Create image sample with group and 2D data
            image_sample = fo.Sample(filepath=orig_data["filepath"])
            image_sample["group"] = group.element(image_slice_name)

            # Restore original fields
            for field_name, field_value in orig_data["fields"].items():
                image_sample[field_name] = field_value

            # Add 2D keypoints for all detected people
            people_list = pred.get("people", [])
            if people_list:
                # Store all people's 2D keypoints
                for person in people_list:
                    if person.get("keypoints_2d") is not None:
                        keypoints_2d_field = f"{label_field}_2d"
                        # For now, store the first person's keypoints
                        # TODO: Support multiple detections per image using fol.Keypoints
                        image_sample[keypoints_2d_field] = HumanPose2D(
                            keypoints=person["keypoints_2d"],
                            bounding_box=person.get("bbox"),
                        )
                        break  # Only store first person for now

            all_new_samples.append(image_sample)

            # Create 3D scene sample if mesh was generated
            if pred.get("scene_path") is not None:
                scene_sample = fo.Sample(filepath=pred["scene_path"])
                scene_sample["group"] = group.element(scene_slice_name)

                # Store all people's 3D data in the HumanPose3D label
                scene_sample[f"{label_field}_3d"] = HumanPose3D(
                    people=people_list
                )
                all_new_samples.append(scene_sample)

        # Add all samples at once - FiftyOne will detect groups automatically
        logger.info(f"Adding {len(all_new_samples)} samples to dataset...")
        dataset.add_samples(all_new_samples)

        logger.info(
            f"Created grouped dataset with {len(all_predictions)} groups"
        )
        logger.info(f"Dataset media type is now: {dataset.media_type}")
        return dataset

    def _predict_all(self, imgs, start_idx=0):
        """Performs batch prediction on images with multi-person support.

        Args:
            imgs: list of images to process
            start_idx: starting index for file naming (for batched processing)

        Returns:
            list of prediction dictionaries, one per image. Each dictionary contains
            'people' (list of per-person detections) and 'scene_path'
        """
        if (
            self._person_detector is None
            or not self.config.enable_multi_person
        ):
            # Single-person mode: process full images
            return self._predict_all_single_person(imgs, start_idx)

        # Multi-person mode: detect people and process each individually
        predictions_per_image = []

        for img_idx, img in enumerate(imgs):
            # Convert to numpy array if needed
            if isinstance(img, Image.Image):
                img_np = np.array(img)
            elif isinstance(img, torch.Tensor):
                img_np = img.cpu().numpy()
                if img_np.ndim == 3 and img_np.shape[0] in (1, 3, 4):
                    # CHW -> HWC
                    img_np = img_np.transpose(1, 2, 0)
                if img_np.max() <= 1.0:
                    img_np = (img_np * 255).astype(np.uint8)
            else:
                img_np = img

            # Ensure RGB
            if img_np.ndim == 2:
                img_np = np.repeat(img_np[..., None], 3, axis=2)
            elif img_np.shape[2] == 1:
                img_np = np.repeat(img_np, 3, axis=2)
            elif img_np.shape[2] == 4:
                img_np = img_np[..., :3]

            # Convert RGB to BGR for Detectron2
            img_bgr = img_np[..., ::-1].copy()

            # Detect people
            boxes = self._person_detector.detect(img_bgr)

            if len(boxes) == 0:
                logger.warning(
                    f"No people detected in image {start_idx + img_idx}"
                )
                predictions_per_image.append(
                    {"people": [], "scene_path": None}
                )
                continue

            logger.info(
                f"Detected {len(boxes)} people in image {start_idx + img_idx}"
            )

            # Process each detected person
            people_data = []
            for person_idx, box in enumerate(boxes):
                x1, y1, x2, y2 = box
                w, h = x2 - x1, y2 - y1

                # Compute box center and size (square box)
                cx = (x1 + x2) / 2.0
                cy = (y1 + y2) / 2.0
                box_size = max(w, h)

                # Expand box slightly for context
                scale = 1.2
                box_size *= scale

                # Compute crop bounds
                x1_crop = int(max(0, cx - box_size / 2))
                y1_crop = int(max(0, cy - box_size / 2))
                x2_crop = int(min(img_np.shape[1], cx + box_size / 2))
                y2_crop = int(min(img_np.shape[0], cy + box_size / 2))

                # Crop image
                img_crop = img_np[y1_crop:y2_crop, x1_crop:x2_crop]

                # Preprocess crop for HMR2
                img_crop_t = self._preprocess_image(img_crop)

                # Run HMR2 on crop
                batch = {"img": img_crop_t.unsqueeze(0).to(self._device)}
                with torch.no_grad():
                    outputs = self._hmr2(batch)

                # Extract predictions
                pred_cam = outputs["pred_cam"][0].cpu().numpy()
                pred_pose = (
                    outputs["pred_smpl_params"]["body_pose"][0].cpu().numpy()
                )
                pred_betas = (
                    outputs["pred_smpl_params"]["betas"][0].cpu().numpy()
                )
                pred_global_orient = (
                    outputs["pred_smpl_params"]["global_orient"][0]
                    .cpu()
                    .numpy()
                )
                pred_keypoints_3d = (
                    outputs["pred_keypoints_3d"][0].cpu().numpy()
                )

                # Get 2D keypoints if available
                pred_keypoints_2d = None
                if "pred_keypoints_2d" in outputs:
                    pred_keypoints_2d = (
                        outputs["pred_keypoints_2d"][0].cpu().numpy()
                    )

                # Transform camera from crop space to full image space
                img_size = np.array(
                    [img_np.shape[1], img_np.shape[0]]
                )  # [width, height]
                box_center = np.array([cx, cy])

                # Compute scaled focal length
                target_size = getattr(self._hmr2.cfg.MODEL, "IMAGE_SIZE", 256)
                if isinstance(target_size, (list, tuple)):
                    target_size = max(target_size)
                focal_length = (
                    self._hmr2.cfg.EXTRA.FOCAL_LENGTH
                    / target_size
                    * img_size.max()
                )

                cam_t_full = cam_crop_to_full(
                    pred_cam, box_center, box_size, img_size, focal_length
                )

                # Store person data (convert all numpy types to Python types)
                person_dict = {
                    "smpl_params": {
                        "body_pose": pred_pose.tolist(),
                        "betas": pred_betas.tolist(),
                        "global_orient": pred_global_orient.tolist(),
                        "camera": pred_cam.tolist(),
                    },
                    "camera_translation": cam_t_full.tolist(),
                    "keypoints_3d": pred_keypoints_3d.tolist(),
                    "keypoints_2d": pred_keypoints_2d.tolist()
                    if pred_keypoints_2d is not None
                    else None,
                    "bbox": [float(x1), float(y1), float(x2), float(y2)],
                    "person_id": int(person_idx),
                }
                # Sanitize all numpy types
                person_dict = _numpy_to_python(person_dict)
                people_data.append(person_dict)

            # Generate multi-mesh scene
            scene_path = None
            if self._smpl is not None and self.config.export_meshes:
                scene_path = self._generate_multi_person_scene(
                    people_data, start_idx + img_idx, img_np.shape[:2]
                )

            predictions_per_image.append(
                {"people": people_data, "scene_path": scene_path}
            )

        return predictions_per_image

    def _preprocess_image(self, img):
        """Preprocess a single image for HMR2.

        Args:
            img: numpy array (HWC, uint8)

        Returns:
            torch tensor (CHW, float, normalized)
        """
        # Convert to tensor
        img_t = torch.from_numpy(img).permute(2, 0, 1).float() / 255.0

        # Resize to model input size
        target_hw = getattr(self._hmr2.cfg.MODEL, "IMAGE_SIZE", 256)
        if isinstance(target_hw, (list, tuple)):
            target_h = int(target_hw[1])
            target_w = int(target_hw[0])
        else:
            target_h = target_w = int(target_hw)

        img_t = torch.nn.functional.interpolate(
            img_t.unsqueeze(0),
            size=(target_h, target_w),
            mode="bilinear",
            align_corners=False,
        )[0]

        # Normalize
        mean = torch.tensor(self._hmr2.cfg.MODEL.IMAGE_MEAN, dtype=img_t.dtype)
        std = torch.tensor(self._hmr2.cfg.MODEL.IMAGE_STD, dtype=img_t.dtype)
        img_t = (img_t - mean.view(3, 1, 1)) / std.view(3, 1, 1)

        return img_t

    def _predict_all_single_person(self, imgs, start_idx=0):
        """Fallback for single-person mode (processes full images).

        Args:
            imgs: list of images to process
            start_idx: starting index for file naming

        Returns:
            list of prediction dictionaries in multi-person format for consistency
        """
        # Convert inputs to Torch tensor (B, C, H, W), resize, and normalize
        proc = []
        for img in imgs:
            if isinstance(img, Image.Image):
                img = np.array(img)
            if isinstance(img, np.ndarray):
                # Ensure HWC uint8, strip alpha channel if present
                if img.ndim == 2:
                    img = np.repeat(img[..., None], 3, axis=2)
                elif img.shape[2] == 1:
                    img = np.repeat(img, 3, axis=2)
                elif img.shape[2] == 4:
                    # Strip alpha channel (RGBA -> RGB)
                    img = img[..., :3]
                img_t = torch.from_numpy(img).permute(2, 0, 1).float() / 255.0
            elif isinstance(img, torch.Tensor):
                if img.ndim == 3 and img.shape[0] in (1, 3, 4):
                    img_t = img.float().clone()
                elif img.ndim == 3 and img.shape[2] in (1, 3, 4):
                    img_t = img.permute(2, 0, 1).float().clone()
                else:
                    # Assume already CHW float
                    img_t = img.float().clone()
                # Handle different channel counts
                if img_t.shape[0] == 1:
                    img_t = img_t.repeat(3, 1, 1)
                elif img_t.shape[0] == 4:
                    # Strip alpha channel (RGBA -> RGB)
                    img_t = img_t[:3, :, :]
            else:
                raise ValueError(
                    "Unsupported image type for HRM2 preprocessing"
                )

            proc.append(img_t)

        imgs_t = torch.stack(proc, dim=0)

        # Resize to config image size
        target_hw = getattr(self._hmr2.cfg.MODEL, "IMAGE_SIZE", 256)
        if isinstance(target_hw, (list, tuple)):
            target_h = int(target_hw[1])
            target_w = int(target_hw[0])
        else:
            target_h = target_w = int(target_hw)
        imgs_t = torch.nn.functional.interpolate(
            imgs_t,
            size=(target_h, target_w),
            mode="bilinear",
            align_corners=False,
        )

        # Normalize
        mean = torch.tensor(
            self._hmr2.cfg.MODEL.IMAGE_MEAN, dtype=imgs_t.dtype
        )
        std = torch.tensor(self._hmr2.cfg.MODEL.IMAGE_STD, dtype=imgs_t.dtype)
        imgs_t = (imgs_t - mean.view(1, 3, 1, 1)) / std.view(1, 3, 1, 1)

        # Move to device
        imgs_t = imgs_t.to(self._device)

        # HMR2 expects a dict with key 'img'
        batch = {"img": imgs_t}

        # Run inference
        with torch.no_grad():
            outputs = self._hmr2(batch)

        # Process outputs - convert to multi-person format
        predictions = []
        for i in range(len(imgs)):
            pred = self._process_output(outputs, i, start_idx + i)
            predictions.append(pred)

        return predictions

    def _process_output(self, outputs, batch_idx, global_idx):
        """Process HRM2 output for a single image in single-person mode.

        Args:
            outputs: model outputs for the batch
            batch_idx: index within the current batch (0 to batch_size-1)
            global_idx: global index for unique file naming

        Returns a dictionary in multi-person format for consistency:
            {'people': [...], 'scene_path': ...}
        """
        # Extract SMPL parameters
        pred_cam = outputs["pred_cam"][batch_idx].cpu().numpy()
        pred_pose = (
            outputs["pred_smpl_params"]["body_pose"][batch_idx].cpu().numpy()
        )
        pred_betas = (
            outputs["pred_smpl_params"]["betas"][batch_idx].cpu().numpy()
        )
        pred_global_orient = (
            outputs["pred_smpl_params"]["global_orient"][batch_idx]
            .cpu()
            .numpy()
        )

        # Get 3D keypoints
        pred_keypoints_3d = (
            outputs["pred_keypoints_3d"][batch_idx].cpu().numpy()
        )

        # Get 2D keypoints if available
        pred_keypoints_2d = None
        if "pred_keypoints_2d" in outputs:
            pred_keypoints_2d = (
                outputs["pred_keypoints_2d"][batch_idx].cpu().numpy()
            )

        # Create person data structure (convert all numpy types to Python types)
        person_data = {
            "smpl_params": {
                "body_pose": pred_pose.tolist(),
                "betas": pred_betas.tolist(),
                "global_orient": pred_global_orient.tolist(),
                "camera": pred_cam.tolist(),
            },
            "keypoints_3d": pred_keypoints_3d.tolist(),
            "keypoints_2d": pred_keypoints_2d.tolist()
            if pred_keypoints_2d is not None
            else None,
            "bbox": None,  # No bbox in single-person mode
            "person_id": 0,
        }
        # Sanitize all numpy types
        person_data = _numpy_to_python(person_data)

        # Generate 3D mesh scene if SMPL is available
        scene_path = None
        if self._smpl is not None and self.config.export_meshes:
            scene_path = self._generate_multi_person_scene(
                [person_data], global_idx, None
            )

        # Return in multi-person format
        return {"people": [person_data], "scene_path": scene_path}

    def _generate_multi_person_scene(self, people_data, idx, img_shape=None):
        """Generate 3D scene with multiple person meshes and optimal camera.

        Args:
            people_data: list of person detection dictionaries
            idx: image index for file naming
            img_shape: optional (height, width) for camera setup

        Returns:
            path to the generated .fo3d scene file
        """
        import trimesh
        from fiftyone.core.threed import Scene, ObjMesh, PerspectiveCamera

        # Track all vertices for bounding box calculation
        all_vertices = []

        # Generate mesh for each person
        mesh_objects = []
        for person in people_data:
            person_id = person["person_id"]
            smpl_params = person["smpl_params"]

            # Extract SMPL parameters from lists
            body_pose = np.array(smpl_params["body_pose"])
            betas = np.array(smpl_params["betas"])
            global_orient = np.array(smpl_params["global_orient"])

            # Run SMPL forward pass
            body_pose_torch = (
                torch.from_numpy(body_pose)
                .unsqueeze(0)
                .float()
                .to(self._device)
            )
            betas_torch = (
                torch.from_numpy(betas).unsqueeze(0).float().to(self._device)
            )
            global_orient_torch = (
                torch.from_numpy(global_orient)
                .unsqueeze(0)
                .float()
                .to(self._device)
            )

            output = self._smpl(
                betas=betas_torch,
                body_pose=body_pose_torch,
                global_orient=global_orient_torch,
                pose2rot=False,
            )

            vertices = output.vertices.detach().cpu().numpy()[0]
            faces = self._smpl.faces

            # **CRITICAL: Apply 180° rotation around X-axis to fix coordinate system**
            # This converts from SMPL coordinates (Y-up) to rendering coordinates (Y-down)
            rot_matrix = trimesh.transformations.rotation_matrix(
                np.radians(180), [1, 0, 0]
            )
            vertices_homogeneous = np.hstack(
                [vertices, np.ones((vertices.shape[0], 1))]
            )
            vertices = (rot_matrix @ vertices_homogeneous.T).T[:, :3]

            # Apply camera translation if available (multi-person mode)
            if (
                "camera_translation" in person
                and person["camera_translation"] is not None
            ):
                cam_t = np.array(person["camera_translation"])
                vertices = vertices + cam_t

            # Track vertices for bounding box
            all_vertices.append(vertices)

            # Create mesh
            mesh = trimesh.Trimesh(vertices=vertices, faces=faces)

            # Save as OBJ
            mesh_filename = f"human_mesh_{idx}_person_{person_id}.obj"
            mesh_path = os.path.join(self._mesh_output_dir, mesh_filename)
            mesh.export(mesh_path)

            # Store mesh object for later
            mesh_objects.append(
                ObjMesh(
                    name=f"human_{idx}_person_{person_id}", obj_path=mesh_path
                )
            )

        # Create scene and configure camera based on mesh bounds
        camera = PerspectiveCamera(up="Y")

        if img_shape is not None and len(img_shape) == 2:
            img_h, img_w = img_shape
            if img_h:
                camera.aspect = float(img_w) / float(img_h)

        if all_vertices:
            vertices = np.concatenate(all_vertices, axis=0)
            mins = vertices.min(axis=0)
            maxs = vertices.max(axis=0)
            center = (mins + maxs) / 2.0
            extents = maxs - mins
            max_extent = float(np.max(extents))
            max_extent = max(max_extent, 1e-2)

            half_fov_rad = np.radians(camera.fov) / 2.0
            tan_half_fov = np.tan(half_fov_rad)
            if tan_half_fov < 1e-3:
                tan_half_fov = 1e-3

            distance = (max_extent / 2.0) / tan_half_fov
            distance = max(distance, max_extent)
            distance = max(distance, 0.5)
            distance *= 1.2

            camera.position = (
                center + np.array([0.0, 0.0, distance])
            ).tolist()
            camera.look_at = center.tolist()

            near = max(0.01, distance - max_extent * 2.0)
            far = distance + max_extent * 5.0
            if far <= near:
                far = near + max_extent * 5.0 + 1.0

            camera.near = near
            camera.far = far

        scene = Scene(camera=camera)

        # Add all meshes to scene
        for mesh_obj in mesh_objects:
            scene.add(mesh_obj)

        # Save scene
        scene_filename = f"human_scene_{idx}.fo3d"
        scene_path = os.path.join(self._mesh_output_dir, scene_filename)
        scene.write(scene_path)

        return scene_path


class HumanPose2D(fol.Label):
    """2D human pose keypoints for image samples.

    Args:
        keypoints (None): list of 2D keypoint locations (Nx2) in pixel coordinates
        confidence (None): per-keypoint confidence scores (N,)
        bounding_box (None): bounding box around the detected person [x, y, w, h]
    """

    keypoints = fof.ListField()
    confidence = fof.ListField()
    bounding_box = fof.ListField()

    def __init__(
        self, keypoints=None, confidence=None, bounding_box=None, **kwargs
    ):
        super().__init__(**kwargs)
        self.keypoints = keypoints
        self.confidence = confidence
        self.bounding_box = bounding_box


class HumanPose3D(fol.Label):
    """3D human pose and SMPL parameters for 3D scene samples.

    Supports both single-person and multi-person scenarios.

    Args:
        people (None): list of person detection dictionaries. Each dictionary contains:
            - smpl_params: dict with body_pose, betas, global_orient, camera
            - keypoints_3d: list of 3D keypoint locations
            - keypoints_2d: optional 2D keypoint locations
            - camera_translation: [tx, ty, tz] in full image coordinates (multi-person mode)
            - bbox: [x1, y1, x2, y2] bounding box (multi-person mode)
            - person_id: integer person identifier
        confidence (None): overall confidence score for the prediction
    """

    people = fof.ListField()
    confidence = fof.FloatField()

    def __init__(self, people=None, confidence=None, **kwargs):
        super().__init__(**kwargs)
        self.people = people
        self.confidence = confidence
