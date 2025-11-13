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
from typing import Optional, Dict, List, Tuple, Union, Any, Callable
import warnings

import numpy as np
from PIL import Image

import eta.core.utils as etau

import fiftyone as fo
import fiftyone.core.config as foc
import fiftyone.core.fields as fof
import fiftyone.core.labels as fol
import fiftyone.core.models as fom
import fiftyone.core.utils as fou
import fiftyone.utils.torch as fout
import fiftyone.zoo.models as fozm

fou.ensure_torch()
import torch

logger = logging.getLogger(__name__)

__all__ = [
    "load_hrm2_model",
    "load_smpl_model",
    "HRM2Config",
    "HRM2ModelConfig",
    "HRM2Model",
    "HRM2GetItem",
    "HumanPose2D",
    "HumanPose3D",
]


def _numpy_to_python(obj: Any) -> Any:
    """Recursively convert numpy types to Python native types.

    This is necessary for MongoDB/BSON serialization which doesn't support numpy types.

    Args:
        obj: object to convert (numpy types, dicts, lists, or primitives)

    Returns:
        converted object with Python native types
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


def cam_crop_to_full(
    pred_cam: Union[np.ndarray, torch.Tensor],
    box_center: Union[np.ndarray, torch.Tensor],
    box_size: Union[float, np.ndarray, torch.Tensor],
    img_size: Union[np.ndarray, torch.Tensor],
    focal_length: Union[float, np.ndarray, torch.Tensor],
) -> Union[np.ndarray, torch.Tensor]:
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


def _load_hrm2_checkpoint(checkpoint_path: str) -> Dict[str, Any]:
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


def _detections_to_boxes(
    detections: Optional[fol.Detections],
    img_shape: Union[Tuple[int, int], Image.Image, np.ndarray, torch.Tensor],
) -> Optional[np.ndarray]:
    """Convert FiftyOne Detections to bounding boxes in absolute coordinates.

    Converts FiftyOne's relative bounding box format [x, y, w, h] (normalized 0-1)
    to absolute pixel coordinates [x1, y1, x2, y2].

    Args:
        detections: fol.Detections object or None
        img_shape: (height, width) tuple, or image object (PIL/numpy/torch)

    Returns:
        numpy array of boxes [[x1, y1, x2, y2], ...] in absolute pixel
        coordinates, or None if no detections
    """
    if detections is None or len(detections.detections) == 0:
        return None

    # Get image dimensions from various input types
    if isinstance(img_shape, tuple):
        img_h, img_w = img_shape
    elif isinstance(img_shape, Image.Image):
        img_w, img_h = img_shape.size
    elif isinstance(img_shape, np.ndarray):
        img_h, img_w = img_shape.shape[:2]
    elif isinstance(img_shape, torch.Tensor):
        if img_shape.ndim == 3 and img_shape.shape[0] in (1, 3, 4):  # CHW
            img_h, img_w = img_shape.shape[1], img_shape.shape[2]
        else:  # HWC
            img_h, img_w = img_shape.shape[:2]
    else:
        raise ValueError(f"Unsupported image type: {type(img_shape)}")

    boxes = []
    for detection in detections.detections:
        # FiftyOne format: [x, y, w, h] in relative coordinates [0, 1]
        x, y, w, h = detection.bounding_box
        # Convert to absolute coordinates [x1, y1, x2, y2]
        x1 = x * img_w
        y1 = y * img_h
        x2 = (x + w) * img_w
        y2 = (y + h) * img_h
        boxes.append([x1, y1, x2, y2])

    return np.array(boxes)


class HRM2OutputProcessor(fout.OutputProcessor):
    """Converts HRM2 raw outputs to FiftyOne HumanPose3D labels.

    This processor handles all postprocessing logic including tensor-to-Python
    conversion, mesh generation, and label creation.

    Args:
        smpl_model (None): Optional SMPL model for mesh generation
        export_meshes (True): whether to generate 3D mesh files
        mesh_output_dir (None): directory for mesh output
        confidence_thresh (None): minimum confidence threshold
        device (None): device for SMPL model operations
    """

    def __init__(
        self,
        smpl_model=None,
        export_meshes=True,
        mesh_output_dir=None,
        confidence_thresh=None,
        device=None,
        **kwargs,
    ):
        super().__init__(**kwargs)
        self._smpl = smpl_model
        self.export_meshes = export_meshes
        self.mesh_output_dir = mesh_output_dir
        if self.mesh_output_dir is None:
            # Use FiftyOne's model zoo directory for persistent storage
            self.mesh_output_dir = os.path.join(
                fo.config.model_zoo_dir, "hrm2_meshes"
            )
        # Ensure directory exists
        etau.ensure_dir(self.mesh_output_dir)
        self.confidence_thresh = confidence_thresh
        self._device = device

    def __call__(
        self,
        outputs: List[Dict[str, Any]],
        frame_size: Tuple[int, int],
        confidence_thresh: Optional[float] = None,
    ) -> List["HumanPose3D"]:
        """Convert raw HRM2 outputs to HumanPose3D labels.

        Args:
            outputs: List of raw output dicts from _forward_pass, each containing:
                - "people": List of person detection dicts with raw tensors
                - "img_shape": (height, width) of the source image
            frame_size: (width, height) tuple (not used but required by interface)
            confidence_thresh: optional confidence threshold

        Returns:
            List of HumanPose3D labels, one per image
        """
        labels = []

        for idx, output in enumerate(outputs):
            people_data = []

            # Process each person's raw output
            for person_raw in output["people"]:
                person_dict = self._process_person(person_raw)
                people_data.append(person_dict)

            # Generate scene if enabled
            scene_path = None
            if self._smpl is not None and self.export_meshes and people_data:
                scene_path = self._generate_scene(
                    people_data, idx, output.get("img_shape")
                )

            # Create label with scene_path
            label = HumanPose3D(
                people=people_data, confidence=None, scene_path=scene_path
            )
            labels.append(label)

        return labels

    def _process_person(self, person_raw: Dict[str, Any]) -> Dict[str, Any]:
        """Convert a single person's raw tensors to Python types.

        Args:
            person_raw: Dict with raw tensor outputs from model

        Returns:
            Dict with Python native types ready for MongoDB serialization
        """
        # Helper to safely convert tensors to lists
        def to_list(x):
            if x is None:
                return None
            if isinstance(x, torch.Tensor):
                return x.cpu().numpy().tolist()
            if isinstance(x, np.ndarray):
                return x.tolist()
            return x

        person_dict = {
            "smpl_params": {
                "body_pose": to_list(
                    person_raw["pred_smpl_params"]["body_pose"]
                ),
                "betas": to_list(person_raw["pred_smpl_params"]["betas"]),
                "global_orient": to_list(
                    person_raw["pred_smpl_params"]["global_orient"]
                ),
                "camera": to_list(person_raw["pred_cam"]),
            },
            "keypoints_3d": to_list(person_raw["pred_keypoints_3d"]),
            "keypoints_2d": to_list(person_raw.get("pred_keypoints_2d")),
            "bbox": person_raw.get("bbox"),
            "person_id": person_raw["person_id"],
        }

        # Add camera translation if present
        if (
            "camera_translation" in person_raw
            and person_raw["camera_translation"] is not None
        ):
            person_dict["camera_translation"] = to_list(
                person_raw["camera_translation"]
            )

        return _numpy_to_python(person_dict)

    def _generate_scene(
        self,
        people_data: List[Dict],
        idx: int,
        img_shape: Optional[Tuple[int, int]] = None,
    ) -> Optional[str]:
        """Generate 3D scene with multiple person meshes and optimal camera.

        Args:
            people_data: list of person detection dictionaries (processed)
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
            mesh_path = os.path.join(self.mesh_output_dir, mesh_filename)
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
        scene_path = os.path.join(self.mesh_output_dir, scene_filename)
        scene.write(scene_path)

        return scene_path


class HRM2GetItem(fout.GetItem):
    """GetItem that loads images and detections for HRM2 inference.

    This class defines how to load data from FiftyOne samples for HRM2 model
    inference. It loads images and optional detection bounding boxes that can
    be used for multi-person processing.

    Args:
        field_mapping (None): user-supplied dict mapping keys to dataset field
            names
        transform (None): optional image transform to apply
        use_numpy (False): whether to use numpy arrays for image loading
    """

    def __init__(
        self,
        field_mapping: Optional[Dict[str, str]] = None,
        transform: Optional[Callable] = None,
        use_numpy: bool = False,
        **kwargs: Any,
    ) -> None:
        # Store whether we have a prompt field BEFORE calling parent init
        # (parent init calls required_keys which needs this attribute)
        self._has_prompt_field = (
            field_mapping is not None and "prompt_field" in field_mapping
        )
        super().__init__(field_mapping=field_mapping, **kwargs)
        self.transform = transform
        self.use_numpy = use_numpy

    def __call__(self, d: Dict[str, Any]) -> Dict[str, Any]:
        """Load image and detections for a sample.

        Args:
            d: dict with 'filepath' and optionally 'prompt_field' keys from the sample

        Returns:
            dict with 'image', 'detections', and 'filepath' keys
        """
        img = fout._load_image(
            d["filepath"],
            use_numpy=self.use_numpy,
            force_rgb=True,
        )

        # Get detections from prompt_field (can be None for single-person mode)
        detections = d.get("prompt_field")

        # Apply transforms if provided
        if self.transform is not None:
            img = self.transform(img)

        return {
            "image": img,
            "detections": detections,
            "filepath": d["filepath"],
        }

    @property
    def required_keys(self) -> List[str]:
        """Required keys that must be present in sample dicts."""
        keys = ["filepath"]
        if self._has_prompt_field:
            keys.append("prompt_field")
        return keys


def load_hrm2_model(
    checkpoint_version: str = "2.0b",
    checkpoint_path: Optional[str] = None,
    model_config_path: Optional[str] = None,
    init_renderer: bool = False,
    device: str = "cpu",
    **kwargs: Any,
) -> Any:
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


def load_smpl_model(
    smpl_model_path: str, device: str = "cpu", **kwargs: Any
) -> Any:
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
        detections_field (None): optional field name containing person detections
            to use for multi-person processing. If provided, HRM2 will process
            each detected person separately. If None, processes the full image
            as single-person mode
        **kwargs: additional parameters for :class:`TorchImageModelConfig`
    """

    def __init__(self, d: Dict[str, Any]) -> None:
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

        # Detections field for multi-person processing
        self.detections_field = self.parse_string(
            d, "detections_field", default=None
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

        # Enable ragged batches for heterogeneous data from GetItem
        d["ragged_batches"] = True

        # Configure output processor
        if d.get("output_processor_cls") is None:
            d["output_processor_cls"] = HRM2OutputProcessor

        if d.get("output_processor_args") is None:
            d["output_processor_args"] = {}

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


class HRM2Model(
    fout.TorchSamplesMixin,
    fout.TorchImageModel,
    fom.SupportsGetItem,
):
    """Wrapper for evaluating HRM2.0 (4D-Humans) on images.

    HRM2.0 performs 3D human mesh reconstruction from single images, outputting
    SMPL body model parameters, 3D meshes, and keypoints.

    This model implements the SupportsGetItem mixin to enable efficient batch
    processing with PyTorch DataLoaders and the FiftyOne apply_model() framework.

    Args:
        config: an :class:`HRM2Config`
    """

    def __init__(self, config: HRM2Config) -> None:
        # Set instance attributes BEFORE parent init (which calls _load_model)
        self._hmr2: Optional[Any] = None
        self._smpl: Optional[Any] = None
        self._mesh_output_dir: str = config.mesh_output_dir
        if self._mesh_output_dir is None:
            # Use FiftyOne's model zoo directory for persistent storage
            self._mesh_output_dir = os.path.join(
                fo.config.model_zoo_dir, "hrm2_meshes"
            )
        # Ensure directory exists
        etau.ensure_dir(self._mesh_output_dir)

        # Now initialize parent classes
        fout.TorchSamplesMixin.__init__(self)
        fout.TorchImageModel.__init__(self, config)

    def _download_model(self, config: HRM2Config) -> None:
        """Download model if it's a zoo model."""
        # Download via zoo if HasZooModel is available and model identifiers are provided
        if hasattr(config, "download_model_if_necessary"):
            model_name = getattr(config, "model_name", None)
            model_path = getattr(config, "model_path", None)
            if model_name or model_path:
                config.download_model_if_necessary()
        # Note: HRM2 uses 4D-Humans' own download mechanism via entrypoint
        # The checkpoint paths are resolved in the load_hrm2_model() entrypoint function

    def _load_model(self, config: HRM2Config) -> Any:
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
            self._smpl = None
            logger.warning(
                "No SMPL model path provided. 3D mesh generation will not be "
                "available. Please provide smpl_model_path in config."
            )

        # Build output processor AFTER SMPL is loaded
        self._output_processor = self._build_output_processor()

        return self._hmr2

    def _build_output_processor(self, config=None):
        """Build the output processor with SMPL model and mesh settings.

        Args:
            config: optional config (parent class passes this, but we use self.config)
        """
        if self.config.output_processor_cls is None:
            return None

        # Prepare args for processor
        args = (
            self.config.output_processor_args.copy()
            if self.config.output_processor_args
            else {}
        )
        args.update(
            {
                "smpl_model": self._smpl,  # Pass loaded SMPL model
                "export_meshes": self.config.export_meshes,
                "mesh_output_dir": self._mesh_output_dir,
                "confidence_thresh": self.config.confidence_thresh,
                "device": self._device,
            }
        )

        return self.config.output_processor_cls(**args)

    def build_get_item(
        self, field_mapping: Optional[Dict[str, str]] = None
    ) -> HRM2GetItem:
        """Build the GetItem instance for data loading.

        This method is called by the FiftyOne apply_model() framework to create
        a GetItem instance that defines how to load data from samples for this
        model.

        Args:
            field_mapping: optional dict mapping required_keys to dataset
                field names. If not provided, will attempt to auto-configure from
                the model's needs_fields or config.

        Returns:
            an :class:`HRM2GetItem` instance
        """
        # Ensure field_mapping is a dict
        if field_mapping is None:
            field_mapping = {}

        # Auto-add prompt_field if we have a detections field
        if "prompt_field" not in field_mapping:
            prompt_field = self._get_field()
            if prompt_field:
                field_mapping["prompt_field"] = prompt_field

        return HRM2GetItem(
            field_mapping=field_mapping if field_mapping else None,
            transform=self._transforms,
            use_numpy=False,
        )

    def predict(
        self, img: Union[Image.Image, np.ndarray, torch.Tensor]
    ) -> "HumanPose3D":
        """Run HRM2 inference on a single image.

        This method performs single-person 3D human mesh reconstruction on the
        provided image. For multi-person scenarios or dataset-level inference,
        use dataset.apply_model() with the detections_field parameter.

        Args:
            img: input image as PIL.Image, numpy array (HWC), or torch.Tensor

        Returns:
            HumanPose3D label containing SMPL parameters, 3D keypoints, and mesh
            information for the detected person
        """
        return self.predict_all([img])[0]

    def predict_all(
        self,
        imgs: List[
            Union[Image.Image, np.ndarray, torch.Tensor, Dict[str, Any]]
        ],
        samples: Optional[Any] = None,
    ) -> List["HumanPose3D"]:
        """Run HRM2 inference on a list of images or batch data.

        This method performs single-person 3D human mesh reconstruction on each
        image in the list. For multi-person scenarios or dataset-level inference,
        use dataset.apply_model() with the detections_field parameter.

        Args:
            imgs: list of images (PIL.Image, numpy array, or torch.Tensor) OR
                list of dicts from GetItem with 'image', 'detections', 'filepath'
            samples: optional FiftyOne samples (not used for direct predict)

        Returns:
            list of HumanPose3D labels, one per image
        """
        # Check if we're receiving dicts from GetItem (dataloader mode)
        # or raw images (direct predict mode)
        if imgs and isinstance(imgs[0], dict):
            # Already in batch_data format from GetItem
            batch_data = imgs
        else:
            # Create batch data format from raw images
            batch_data = [
                {
                    "image": img,
                    "detections": None,  # single-person mode
                    "filepath": f"image_{idx}",
                }
                for idx, img in enumerate(imgs)
            ]

        return self._predict_all(batch_data)

    def _get_field(self) -> Optional[str]:
        """Get the detection field name from needs_fields or config.

        Returns:
            field name string or None
        """
        # First check needs_fields (set by apply_model with prompt_field)
        if "prompt_field" in self.needs_fields:
            field_name = self.needs_fields["prompt_field"]
        elif self.needs_fields:
            field_name = next(iter(self.needs_fields.values()), None)
        else:
            # Fall back to config
            field_name = getattr(self.config, "detections_field", None)

        # Handle video frames
        if field_name is not None and field_name.startswith("frames."):
            field_name = field_name[len("frames.") :]

        return field_name

    def _predict_all(
        self, batch_data: List[Dict[str, Any]]
    ) -> List["HumanPose3D"]:
        """Process batch and return labels via output processor.

        This method receives data from the GetItem instance, performs inference
        via _forward_pass(), and converts raw outputs to HumanPose3D labels
        using the output processor.

        Args:
            batch_data: list of dicts from GetItem, each containing:
                - 'image': the loaded image (PIL/numpy/tensor)
                - 'detections': fol.Detections object or None
                - 'filepath': path to the source image

        Returns:
            list of HumanPose3D labels (if processor exists) or raw outputs
        """
        # Get raw outputs from forward pass
        raw_outputs = self._forward_pass(batch_data)

        # If no processor, return raw outputs
        if self._output_processor is None:
            return raw_outputs

        # Process through output processor
        # Note: frame_size not used by HRM2 but required by interface
        frame_size = (256, 256)  # placeholder

        return self._output_processor(
            raw_outputs,
            frame_size,
            confidence_thresh=self.config.confidence_thresh,
        )

    def _forward_pass(
        self, batch_data: List[Dict[str, Any]]
    ) -> List[Dict[str, Any]]:
        """Run HRM2 inference and return raw outputs.

        This method handles the core inference logic and returns structured
        raw outputs (tensors on CPU) for postprocessing.

        Args:
            batch_data: List of dicts from GetItem with 'image', 'detections', 'filepath'

        Returns:
            List of raw output dicts, one per image, each containing:
                - "people": List[person_raw_dict] with raw tensors
                - "img_shape": (height, width) of source image
        """
        raw_outputs = []

        for idx, data in enumerate(batch_data):
            img = data["image"]
            detections = data.get("detections")

            # Process based on detection mode
            if detections is not None and len(detections.detections) > 0:
                output = self._inference_with_detections(img, detections, idx)
            else:
                output = self._inference_single_person(img, idx)

            raw_outputs.append(output)

        return raw_outputs

    def _to_numpy(self, img):
        """Convert image to numpy array in HWC uint8 format.

        Args:
            img: image as PIL.Image, numpy array, or torch.Tensor

        Returns:
            numpy array in HWC uint8 format
        """
        return fout.to_numpy_image(img)

    def _ensure_rgb_numpy(self, img_np: np.ndarray) -> np.ndarray:
        """Ensure numpy image is in RGB format (HWC uint8).

        Handles grayscale, single-channel, and RGBA inputs by converting
        to 3-channel RGB format.

        Args:
            img_np: numpy array (HWC uint8)

        Returns:
            numpy array in RGB format (HWC uint8, 3 channels)
        """
        if img_np.ndim == 2:
            return np.repeat(img_np[..., None], 3, axis=2)
        elif img_np.shape[2] == 1:
            return np.repeat(img_np, 3, axis=2)
        elif img_np.shape[2] == 4:
            return img_np[..., :3]
        return img_np

    def _get_target_size(self) -> Tuple[int, int]:
        """Get target image size (height, width) from model config.

        Returns:
            tuple of (height, width) for model input
        """
        target_hw = getattr(self._hmr2.cfg.MODEL, "IMAGE_SIZE", 256)
        if isinstance(target_hw, (list, tuple)):
            return int(target_hw[1]), int(target_hw[0])
        else:
            return int(target_hw), int(target_hw)

    def _normalize_tensor(self, img_t: torch.Tensor) -> torch.Tensor:
        """Normalize tensor using model's mean and std.

        Args:
            img_t: input tensor (CHW, float, range [0, 1])

        Returns:
            normalized tensor (CHW, float, normalized)
        """
        mean = torch.tensor(self._hmr2.cfg.MODEL.IMAGE_MEAN, dtype=img_t.dtype)
        std = torch.tensor(self._hmr2.cfg.MODEL.IMAGE_STD, dtype=img_t.dtype)
        return (img_t - mean.view(3, 1, 1)) / std.view(3, 1, 1)

    def _resize_tensor(
        self, img_t: torch.Tensor, target_h: int, target_w: int
    ) -> torch.Tensor:
        """Resize tensor to target dimensions using bilinear interpolation.

        Args:
            img_t: input tensor (CHW, float)
            target_h: target height
            target_w: target width

        Returns:
            resized tensor (CHW, float)
        """
        return torch.nn.functional.interpolate(
            img_t.unsqueeze(0),
            size=(target_h, target_w),
            mode="bilinear",
            align_corners=False,
        )[0]

    def _run_inference(self, img_t: torch.Tensor) -> Dict[str, Any]:
        """Run HMR2 inference on preprocessed tensor.

        Args:
            img_t: preprocessed image tensor (CHW, float, normalized)

        Returns:
            dict with HMR2 model outputs including SMPL parameters and keypoints
        """
        batch = {"img": img_t.unsqueeze(0).to(self._device)}
        with torch.no_grad():
            return self._hmr2(batch)

    def _extract_predictions(
        self, outputs: Dict[str, Any]
    ) -> Tuple[
        np.ndarray,
        np.ndarray,
        np.ndarray,
        np.ndarray,
        np.ndarray,
        Optional[np.ndarray],
    ]:
        """Extract SMPL parameters and keypoints from HMR2 outputs.

        Args:
            outputs: dict from HMR2 model containing predictions

        Returns:
            tuple of (pred_cam, pred_pose, pred_betas, pred_global_orient,
                     pred_keypoints_3d, pred_keypoints_2d)
        """
        pred_cam = outputs["pred_cam"][0].cpu().numpy()
        pred_pose = outputs["pred_smpl_params"]["body_pose"][0].cpu().numpy()
        pred_betas = outputs["pred_smpl_params"]["betas"][0].cpu().numpy()
        pred_global_orient = (
            outputs["pred_smpl_params"]["global_orient"][0].cpu().numpy()
        )
        pred_keypoints_3d = outputs["pred_keypoints_3d"][0].cpu().numpy()

        pred_keypoints_2d = None
        if "pred_keypoints_2d" in outputs:
            pred_keypoints_2d = outputs["pred_keypoints_2d"][0].cpu().numpy()

        return (
            pred_cam,
            pred_pose,
            pred_betas,
            pred_global_orient,
            pred_keypoints_3d,
            pred_keypoints_2d,
        )

    def _build_person_raw(
        self,
        pred_cam: np.ndarray,
        pred_pose: np.ndarray,
        pred_betas: np.ndarray,
        pred_global_orient: np.ndarray,
        pred_keypoints_3d: np.ndarray,
        pred_keypoints_2d: Optional[np.ndarray],
        person_id: int = 0,
        bbox: Optional[List[float]] = None,
        camera_translation: Optional[np.ndarray] = None,
    ) -> Dict[str, Any]:
        """Build raw person detection dictionary with tensors.

        This returns raw outputs (tensors on CPU) for processing by the
        output processor. No conversion to Python types is performed here.

        Args:
            pred_cam: camera parameters [s, tx, ty]
            pred_pose: SMPL body pose parameters
            pred_betas: SMPL shape parameters
            pred_global_orient: SMPL global orientation
            pred_keypoints_3d: 3D keypoint locations
            pred_keypoints_2d: optional 2D keypoint locations
            person_id: person identifier
            bbox: optional bounding box [x1, y1, x2, y2]
            camera_translation: optional camera translation [tx, ty, tz]

        Returns:
            person detection dictionary with raw tensors
        """
        # Convert numpy arrays to tensors (on CPU for consistency)
        person_dict = {
            "pred_cam": torch.from_numpy(pred_cam).cpu()
            if isinstance(pred_cam, np.ndarray)
            else pred_cam,
            "pred_smpl_params": {
                "body_pose": torch.from_numpy(pred_pose).cpu()
                if isinstance(pred_pose, np.ndarray)
                else pred_pose,
                "betas": torch.from_numpy(pred_betas).cpu()
                if isinstance(pred_betas, np.ndarray)
                else pred_betas,
                "global_orient": torch.from_numpy(pred_global_orient).cpu()
                if isinstance(pred_global_orient, np.ndarray)
                else pred_global_orient,
            },
            "pred_keypoints_3d": torch.from_numpy(pred_keypoints_3d).cpu()
            if isinstance(pred_keypoints_3d, np.ndarray)
            else pred_keypoints_3d,
            "pred_keypoints_2d": torch.from_numpy(pred_keypoints_2d).cpu()
            if pred_keypoints_2d is not None
            and isinstance(pred_keypoints_2d, np.ndarray)
            else pred_keypoints_2d,
            "bbox": bbox,
            "person_id": person_id,
        }

        if camera_translation is not None:
            person_dict["camera_translation"] = (
                torch.from_numpy(camera_translation).cpu()
                if isinstance(camera_translation, np.ndarray)
                else camera_translation
            )

        return person_dict

    def _convert_to_tensor_chw(
        self, img: Union[Image.Image, np.ndarray, torch.Tensor]
    ) -> torch.Tensor:
        """Convert various image formats to CHW tensor in [0, 1] range.

        Handles PIL Images, numpy arrays (HWC/CHW), and torch tensors.
        Automatically converts grayscale to RGB and strips alpha channels.

        Args:
            img: input image in various formats

        Returns:
            torch.Tensor in CHW format, float, range [0, 1], 3 channels
        """
        # Convert PIL to numpy first
        if isinstance(img, Image.Image):
            img = np.array(img)

        if isinstance(img, np.ndarray):
            # Ensure HWC uint8, strip alpha channel if present
            if img.ndim == 2:
                img = np.repeat(img[..., None], 3, axis=2)
            elif img.ndim == 3 and img.shape[2] == 1:
                img = np.repeat(img, 3, axis=2)
            elif img.ndim == 3 and img.shape[2] == 4:
                # Strip alpha channel (RGBA -> RGB)
                img = img[..., :3]
            elif img.ndim == 3 and img.shape[2] == 3:
                pass  # Already RGB
            else:
                logger.warning(
                    f"Unexpected numpy array shape: {img.shape}, attempting to use as-is"
                )
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
                f"Unsupported image type for HRM2 preprocessing: {type(img)}. "
                f"Expected PIL.Image, np.ndarray, or torch.Tensor"
            )

        return img_t

    def _inference_with_detections(self, img, detections, global_idx):
        """Run inference using provided detections (multi-person mode).

        Args:
            img: image from GetItem (PIL/numpy/tensor)
            detections: fol.Detections object with bounding boxes
            global_idx: image index for logging

        Returns:
            raw output dict with 'people' list (raw tensors) and 'img_shape'
        """
        # Convert to numpy and ensure RGB
        img_np = fout.to_numpy_image(img)
        img_np = self._ensure_rgb_numpy(img_np)

        # Convert detections to boxes
        boxes = _detections_to_boxes(detections, img_np)

        if boxes is None or len(boxes) == 0:
            logger.warning(
                f"No valid boxes for image {global_idx}, using single-person mode"
            )
            return self._inference_single_person(img, global_idx)

        logger.info(f"Processing {len(boxes)} people in image {global_idx}")

        # Process each person - returns raw tensors
        people_data = [
            self._inference_person_crop(img_np, box, person_idx, global_idx)
            for person_idx, box in enumerate(boxes)
        ]

        return {
            "people": people_data,
            "img_shape": (img_np.shape[0], img_np.shape[1]),  # (height, width)
        }

    def _inference_person_crop(self, img_np, box, person_idx, global_idx):
        """Run inference on a single person crop from the image.

        Args:
            img_np: image as numpy array (HWC uint8)
            box: bounding box [x1, y1, x2, y2] in absolute coordinates
            person_idx: person index within the image
            global_idx: global image index for logging

        Returns:
            person detection dict with raw tensors
        """
        x1, y1, x2, y2 = box
        w, h = x2 - x1, y2 - y1

        # Compute box center and expanded size
        cx, cy = (x1 + x2) / 2.0, (y1 + y2) / 2.0
        box_size = max(w, h) * 1.2  # 1.2 scale for context

        # Compute crop bounds (clamped to image)
        x1_crop = int(max(0, cx - box_size / 2))
        y1_crop = int(max(0, cy - box_size / 2))
        x2_crop = int(min(img_np.shape[1], cx + box_size / 2))
        y2_crop = int(min(img_np.shape[0], cy + box_size / 2))

        # Crop and preprocess
        img_crop = img_np[y1_crop:y2_crop, x1_crop:x2_crop]
        img_crop_t = self._preprocess_image(img_crop)

        # Run inference
        outputs = self._run_inference(img_crop_t)

        # Extract predictions
        (
            pred_cam,
            pred_pose,
            pred_betas,
            pred_global_orient,
            pred_keypoints_3d,
            pred_keypoints_2d,
        ) = self._extract_predictions(outputs)

        # Transform camera from crop to full image space
        img_size = np.array([img_np.shape[1], img_np.shape[0]])
        box_center = np.array([cx, cy])

        target_size = max(self._get_target_size())  # Get max of (h, w)
        focal_length = (
            self._hmr2.cfg.EXTRA.FOCAL_LENGTH / target_size * img_size.max()
        )

        cam_t_full = cam_crop_to_full(
            pred_cam, box_center, box_size, img_size, focal_length
        )

        # Build raw person data (tensors on CPU)
        return self._build_person_raw(
            pred_cam,
            pred_pose,
            pred_betas,
            pred_global_orient,
            pred_keypoints_3d,
            pred_keypoints_2d,
            person_id=person_idx,
            bbox=[float(x1), float(y1), float(x2), float(y2)],
            camera_translation=cam_t_full,
        )

    def _inference_single_person(
        self,
        img: Union[Image.Image, np.ndarray, torch.Tensor],
        global_idx: int,
    ) -> Dict[str, Any]:
        """Run inference on full image in single-person mode.

        Args:
            img: image from GetItem (PIL/numpy/tensor)
            global_idx: image index for logging

        Returns:
            raw output dict with single person in 'people' list and 'img_shape'
        """
        # Convert to CHW tensor
        img_t = self._convert_to_tensor_chw(img)

        # Get image shape before resizing
        img_shape = (img_t.shape[1], img_t.shape[2])  # (height, width)

        # Resize and normalize
        target_h, target_w = self._get_target_size()
        img_t = self._resize_tensor(img_t, target_h, target_w)
        img_t = self._normalize_tensor(img_t)
        img_t = img_t.to(self._device)

        # Run inference
        outputs = self._run_inference(img_t)

        # Extract predictions
        (
            pred_cam,
            pred_pose,
            pred_betas,
            pred_global_orient,
            pred_keypoints_3d,
            pred_keypoints_2d,
        ) = self._extract_predictions(outputs)

        # Build raw person data
        person_data = self._build_person_raw(
            pred_cam,
            pred_pose,
            pred_betas,
            pred_global_orient,
            pred_keypoints_3d,
            pred_keypoints_2d,
            person_id=0,
            bbox=None,
            camera_translation=None,
        )

        return {"people": [person_data], "img_shape": img_shape}

    def _preprocess_image(self, img):
        """Preprocess a single image for HMR2.

        Args:
            img: numpy array (HWC, uint8)

        Returns:
            torch tensor (CHW, float, normalized)
        """
        # Convert to tensor
        img_t = torch.from_numpy(img).permute(2, 0, 1).float() / 255.0

        # Resize
        target_h, target_w = self._get_target_size()
        img_t = self._resize_tensor(img_t, target_h, target_w)

        # Normalize
        img_t = self._normalize_tensor(img_t)

        return img_t

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

        This is the standard FiftyOne pattern for linking 2D images with 3D
        reconstructions and enables 3D visualization in the FiftyOne App.

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
        # Check if dataset is already grouped
        if dataset.media_type == "group":
            logger.warning(
                "Dataset is already grouped. This will add new slices to "
                "existing groups."
            )
            is_already_grouped = True
        else:
            is_already_grouped = False

        # Store original sample info before clearing
        logger.info(f"Processing {len(dataset)} samples...")
        original_data = []
        for sample in dataset.iter_samples():
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

        # Apply model to get predictions
        dataset.apply_model(
            self,
            label_field=label_field,
            batch_size=batch_size,
            num_workers=num_workers,
        )

        # Collect predictions with scene paths
        predictions = []
        for sample in dataset.iter_samples():
            pred = sample[label_field]
            predictions.append(pred)

        # Clear dataset to rebuild with groups
        logger.info("Creating grouped dataset structure...")
        dataset.clear()

        # Set up the dataset for groups
        dataset.add_group_field("group", default=image_slice_name)

        # Create all new samples with groups
        all_new_samples = []

        for idx, (orig_data, pred) in enumerate(
            zip(original_data, predictions)
        ):
            # Create group
            group = fo.Group()

            # Create image sample with group and 2D data
            image_sample = fo.Sample(filepath=orig_data["filepath"])
            image_sample["group"] = group.element(image_slice_name)

            # Restore original fields
            for field_name, field_value in orig_data["fields"].items():
                image_sample[field_name] = field_value

            # Add 2D keypoints if available
            if pred and pred.people:
                people_list = pred.people
                # Store first person's 2D keypoints (if available)
                for person in people_list:
                    if person.get("keypoints_2d") is not None:
                        keypoints_2d_field = f"{label_field}_2d"
                        image_sample[keypoints_2d_field] = HumanPose2D(
                            keypoints=person["keypoints_2d"],
                            bounding_box=person.get("bbox"),
                        )
                        break  # Only store first person for now

            all_new_samples.append(image_sample)

            # Create 3D scene sample if mesh was generated
            if pred and pred.scene_path is not None:
                scene_sample = fo.Sample(filepath=pred.scene_path)
                scene_sample["group"] = group.element(scene_slice_name)

                # Store 3D pose data
                scene_sample[f"{label_field}_3d"] = pred
                all_new_samples.append(scene_sample)

        # Add all samples at once - FiftyOne will detect groups automatically
        logger.info(f"Adding {len(all_new_samples)} samples to dataset...")
        dataset.add_samples(all_new_samples)

        logger.info(f"Created grouped dataset with {len(predictions)} groups")
        logger.info(f"Dataset media type is now: {dataset.media_type}")
        logger.info(f"Dataset group slices: {dataset.group_slices}")

        return dataset


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
        scene_path (None): path to the .fo3d scene file containing the 3D meshes
    """

    people = fof.ListField()
    confidence = fof.FloatField()
    scene_path = fof.StringField()

    def __init__(
        self, people=None, confidence=None, scene_path=None, **kwargs
    ):
        super().__init__(**kwargs)
        self.people = people
        self.confidence = confidence
        self.scene_path = scene_path
