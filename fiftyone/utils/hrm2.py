"""
HRM2.0 (4D-Humans) model integration.

This module provides integration with the HRM2.0 model for 3D human pose and
shape estimation from images. It includes:

- Model loading and inference for single and multi-person scenarios
- SMPL body model integration with 3D mesh reconstruction
- 2D and 3D keypoint extraction (OpenPose BODY-25 joints)
- Automatic skeleton configuration for keypoint visualization in the FiftyOne App
- Dataset grouping for simultaneous 2D image and 3D scene viewing

The BODY-25 skeleton is automatically configured when using
:func:`apply_hrm2_to_dataset_as_groups`, enabling skeleton overlays in the
FiftyOne App for both 2D and 3D keypoint visualization.

| Copyright 2017-2025, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""

import logging
import os
import pickle
from pathlib import Path
from typing import Optional, Dict, List, Tuple, Union, Any, Callable

import cv2
import numpy as np
from PIL import Image

import eta.core.utils as etau

import fiftyone as fo
import fiftyone.core.labels as fol
import fiftyone.core.models as fom
import fiftyone.core.storage as fos
import fiftyone.core.utils as fou
import fiftyone.utils.torch as fout
from fiftyone.utils.torch import (
    ensure_rgb_numpy,
    get_target_size,
    detections_to_boxes,
)
import fiftyone.zoo.models as fozm

fou.ensure_torch()
import torch  # pylint: disable=wrong-import-position,wrong-import-order

try:
    from skimage.filters import (  # pylint: disable=no-name-in-module
        gaussian as skimage_gaussian_filter,
    )
except ImportError:  # pragma: no cover - dependency optional
    skimage_gaussian_filter = None

smplx = fou.lazy_import("smplx", callback=lambda: fou.ensure_import("smplx"))

logger = logging.getLogger(__name__)

__all__ = [
    "load_hrm2_model",
    "load_smpl_model",
    "apply_hrm2_to_dataset_as_groups",
    "export_hrm2_scene",
    "HRM2Config",
    "HRM2ModelConfig",
    "HRM2Model",
    "HRM2GetItem",
    "SMPLParams",
    "HRM2Person",
    "get_hrm2_skeleton",
    "HRM2_JOINT_NAMES",
    "HRM2_SKELETON_EDGES",
]

# Processing constants
_DEFAULT_IMAGE_SIZE = 256
_ANTIALIAS_DOWNSAMPLE_THRESHOLD = 1.1
_SIGMA_CALCULATION_FACTOR = 2.0
_CENTER_OFFSET = 0.5


# HMR2/4D-Humans exposes joints reordered to the OpenPose BODY-25 topology.
# See https://cmu-perceptual-computing-lab.github.io/openpose/web/html/
# doc/md_doc_05_output.html
HRM2_JOINT_NAMES = [
    "nose",  # 0
    "neck",  # 1
    "right_shoulder",  # 2
    "right_elbow",  # 3
    "right_wrist",  # 4
    "left_shoulder",  # 5
    "left_elbow",  # 6
    "left_wrist",  # 7
    "mid_hip",  # 8
    "right_hip",  # 9
    "right_knee",  # 10
    "right_ankle",  # 11
    "left_hip",  # 12
    "left_knee",  # 13
    "left_ankle",  # 14
    "right_eye",  # 15
    "left_eye",  # 16
    "right_ear",  # 17
    "left_ear",  # 18
    "left_big_toe",  # 19
    "left_small_toe",  # 20
    "left_heel",  # 21
    "right_big_toe",  # 22
    "right_small_toe",  # 23
    "right_heel",  # 24
]

HRM2_SKELETON_EDGES = [
    # Torso and neck
    [1, 8],  # neck -> mid_hip
    [1, 2],  # neck -> right_shoulder
    [1, 5],  # neck -> left_shoulder
    # Right arm
    [2, 3],  # right_shoulder -> right_elbow
    [3, 4],  # right_elbow -> right_wrist
    # Left arm
    [5, 6],  # left_shoulder -> left_elbow
    [6, 7],  # left_elbow -> left_wrist
    # Right leg
    [8, 9],  # mid_hip -> right_hip
    [9, 10],  # right_hip -> right_knee
    [10, 11],  # right_knee -> right_ankle
    # Left leg
    [8, 12],  # mid_hip -> left_hip
    [12, 13],  # left_hip -> left_knee
    [13, 14],  # left_knee -> left_ankle
    # Head
    [1, 0],  # neck -> nose
    [0, 15],  # nose -> right_eye
    [15, 17],  # right_eye -> right_ear
    [0, 16],  # nose -> left_eye
    [16, 18],  # left_eye -> left_ear
    # Left foot
    [14, 19],  # left_ankle -> left_big_toe
    [19, 20],  # left_big_toe -> left_small_toe
    [14, 21],  # left_ankle -> left_heel
    # Right foot
    [11, 22],  # right_ankle -> right_big_toe
    [22, 23],  # right_big_toe -> right_small_toe
    [11, 24],  # right_ankle -> right_heel
]


def get_hrm2_skeleton():
    """Return the OpenPose BODY-25 skeleton used by HMR2 outputs.

    HMR2/4D-Humans reorders SMPL joints to the OpenPose BODY-25 topology and
    augments the set with additional facial and foot joints. This helper
    returns a :class:`KeypointSkeleton` that matches that ordering so that
    keypoints visualize correctly in the FiftyOne App.

    Returns:
        fiftyone.core.odm.dataset.KeypointSkeleton: BODY-25 skeleton.
    """
    from fiftyone.core.odm.dataset import KeypointSkeleton

    return KeypointSkeleton(
        labels=HRM2_JOINT_NAMES,
        edges=HRM2_SKELETON_EDGES,
    )


# ---------------------------------------------------------------------------
# Dynamic Embedded Documents for HRM2 Metadata
# ---------------------------------------------------------------------------
# These use FiftyOne's DynamicEmbeddedDocument for structured storage
# without modifying labels.py. See:
# https://docs.voxel51.com/user_guide/using_datasets.html#defining-custom-documents-on-the-fly


class SMPLParams(fo.DynamicEmbeddedDocument):
    """SMPL body model parameters for a detected person.

    This document stores the parametric representation of a human body
    from the SMPL model.

    Attributes:
        body_pose: body pose parameters (23 joints × 3 axis-angle), shape (69,)
        betas: shape parameters (typically 10 values)
        global_orient: global body orientation (3 axis-angle values)
    """

    pass


class HRM2Person(fo.DynamicEmbeddedDocument):
    """Per-person HRM2 prediction metadata.

    This stores all HRM2 output data for a single detected person,
    including SMPL parameters, camera, and 3D keypoints. This is a
    dynamic document that can hold any additional attributes.

    Standard attributes set by HRM2:
        person_id: unique identifier for this person in the frame
        smpl_params: SMPLParams document with body model parameters
        camera_weak_perspective: [scale, tx, ty] weak perspective camera
        camera_translation: [tx, ty, tz] full camera translation
        keypoints_3d: list of 3D keypoint coordinates (25 × 3 for BODY-25)
        vertices: list of mesh vertex coordinates (6890 × 3 for SMPL)
        bbox: bounding box [x1, y1, x2, y2] in absolute pixel coordinates,
            where (x1, y1) is the top-left corner and (x2, y2) is the
            bottom-right corner. This format is expected by _normalize_bbox().
    """

    pass


def export_hrm2_scene(
    hrm2_people: List["HRM2Person"],
    smpl_faces: Union[np.ndarray, List],
    frame_size: Optional[List[int]],
    scene_path: str,
) -> str:
    """Export HRM2 meshes to a .fo3d scene file.

    This function exports reconstructed 3D human meshes to a FiftyOne 3D scene
    file that can be visualized in the FiftyOne App. Uses existing
    fiftyone.core.threed infrastructure.

    Args:
        hrm2_people: list of HRM2Person documents containing mesh vertices
        smpl_faces: SMPL face indices array, shape (F, 3)
        frame_size: [height, width] of the originating frame, or None
        scene_path: output path for the .fo3d scene file

    Returns:
        the path to the exported .fo3d file

    Raises:
        ValueError: if no people contain mesh geometry
    """
    import hashlib

    from fiftyone.core.threed import Scene, ObjMesh, PerspectiveCamera

    try:
        import trimesh
    except ImportError:
        raise ImportError(
            "trimesh is required for mesh export. Install it with: "
            "pip install trimesh"
        )

    if not hrm2_people:
        raise ValueError("Cannot export scene: no person data")

    # Collect people with mesh geometry
    people_with_meshes = [
        p for p in hrm2_people if getattr(p, "vertices", None) is not None
    ]

    if not people_with_meshes:
        raise ValueError(
            "Cannot export scene: no people contain mesh geometry"
        )

    fos.ensure_basedir(scene_path)

    uid = hashlib.sha1(scene_path.encode("utf-8")).hexdigest()[:10]
    base_dir = os.path.dirname(scene_path)

    # Convert faces to numpy if needed
    if smpl_faces is not None and not isinstance(smpl_faces, np.ndarray):
        smpl_faces = np.asarray(smpl_faces)

    mesh_objects = []
    all_vertices = []

    frame_size = frame_size or [512, 512]

    for person in people_with_meshes:
        person_id = getattr(person, "person_id", len(mesh_objects))
        vertices = np.asarray(person.vertices)
        all_vertices.append(vertices)

        if smpl_faces is None:
            logger.warning(
                "Person %s has no face data, skipping mesh export", person_id
            )
            continue

        # Export mesh to OBJ
        mesh_filename = f"mesh_{uid}_person_{person_id}.obj"
        mesh_path = os.path.join(base_dir, mesh_filename)

        trimesh_obj = trimesh.Trimesh(
            vertices=vertices, faces=smpl_faces, process=False
        )
        trimesh_obj.export(mesh_path)

        # Add to scene
        mesh_objects.append(
            ObjMesh(
                name=f"Person {person_id}",
                obj_path=mesh_path,
            )
        )

    if not mesh_objects:
        raise ValueError("Cannot export scene: no meshes were generated")

    # Set up camera based on mesh bounds
    if all_vertices:
        all_vertices = np.vstack(all_vertices)
        center = all_vertices.mean(axis=0)
        bbox_size = all_vertices.max(axis=0) - all_vertices.min(axis=0)
        max_dim = bbox_size.max()
        # Clamp to minimum distance to avoid degenerate camera setups
        camera_distance = max(max_dim * 1.5, 1.0)
        camera_position = center + np.array([0, 0, camera_distance])
    else:
        # Fallback if no vertex data available
        center = np.array([0, 0, 0])
        camera_position = np.array([0, 0, 3])

    aspect = (
        frame_size[1] / frame_size[0] if frame_size and frame_size[0] else 1.0
    )

    camera = PerspectiveCamera(
        position=camera_position.tolist(),
        look_at=center.tolist(),
        up="Y",
        aspect=aspect,
    )

    scene = Scene(camera=camera, lights=[])
    for mesh_obj in mesh_objects:
        scene.add(mesh_obj)

    scene.write(scene_path)

    return scene_path


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
    return np.array([tx, ty, tz])


def keypoints_crop_to_full(
    keypoints_crop: np.ndarray,
    transform: np.ndarray,
    crop_window: Tuple[int, int],
    img_size: np.ndarray,
) -> np.ndarray:
    """Transform 2D keypoints from crop space to full image space.

    This function applies the inverse affine transformation to convert keypoints
    predicted on image crops back to absolute pixel coordinates in the full image.

    Args:
        keypoints_crop: predicted 2D keypoints in crop space, shape (N, 2) or (N, 3)
            where N is the number of keypoints. If shape is (N, 3), the third
            column is assumed to be confidence scores which are preserved.
            Coordinates should be in pixel space of the crop (not normalized).
        transform: 2x3 affine transformation matrix used to create the crop
        crop_window: (crop_width, crop_height) of the crop patch
        img_size: [width, height] of the original full image

    Returns:
        keypoints in full image space, shape (N, 2) or (N, 3) with coordinates
        in absolute pixel space. If input had confidence scores (N, 3), they
        are preserved in the output.
    """
    if keypoints_crop.shape[0] == 0:
        return keypoints_crop

    # Separate coordinates and confidence if present
    has_confidence = keypoints_crop.shape[1] == 3
    if has_confidence:
        coords = keypoints_crop[:, :2].astype(np.float32)
        confidence = keypoints_crop[:, 2:3]
    else:
        coords = keypoints_crop.astype(np.float32)

    # Map bounding-box-relative coordinates to crop pixel space.
    # From empirical inspection, HMR2 emits keypoints in approximately
    # [-0.5, 0.5] around the box center. We shift this to [0, 1] and then
    # scale by the crop size to obtain crop pixel coordinates.
    crop_w, crop_h = crop_window
    coords_norm = coords.copy()

    if np.nanmin(coords_norm) < 0.0:
        # [-0.5, 0.5] -> [0, 1]
        coords_norm = coords_norm + 0.5

    # Now in [0, 1] range: scale to crop pixels
    coords_norm[:, 0] *= float(crop_w)
    coords_norm[:, 1] *= float(crop_h)

    # Get inverse affine transform
    # The transform maps from image -> crop, so we need crop -> image
    try:
        transform_inv = cv2.invertAffineTransform(transform)
    except cv2.error:
        logger.warning(
            "Failed to invert affine transform for keypoint reprojection. "
            "Returning keypoints in crop space."
        )
        return keypoints_crop

    # Transform keypoints from crop to full image space
    # cv2.transform expects shape (N, 1, 2)
    coords_homogeneous = coords_norm.reshape(-1, 1, 2).astype(np.float32)
    coords_full = cv2.transform(coords_homogeneous, transform_inv)
    coords_full = coords_full.reshape(-1, 2)

    # Clip to image bounds
    coords_full[:, 0] = np.clip(coords_full[:, 0], 0, img_size[0])
    coords_full[:, 1] = np.clip(coords_full[:, 1], 0, img_size[1])

    # Recombine with confidence if present
    if has_confidence:
        return np.concatenate([coords_full, confidence], axis=1)
    return coords_full


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
        from omegaconf import DictConfig  # pylint: disable=invalid-name
        from omegaconf.base import (
            ContainerMetadata,
        )  # pylint: disable=invalid-name

        omegaconf_classes = [DictConfig, ContainerMetadata]
    except ImportError:
        DictConfig = None  # pylint: disable=invalid-name
        omegaconf_classes = None

    # Preferred path: use the safe_globals context manager introduced in torch 2.6
    # pylint: disable=using-constant-test
    safe_globals_ctx = (
        getattr(serialization, "safe_globals", None) if serialization else None
    )
    if safe_globals_ctx and omegaconf_classes is not None:
        try:
            with safe_globals_ctx(omegaconf_classes):
                return torch.load(checkpoint_path, **load_kwargs)
        except (
            RuntimeError,
            TypeError,
            AttributeError,
            pickle.UnpicklingError,
        ) as e:
            logger.debug(
                "torch.load with safe_globals failed: %s. "
                "Falling back to weights_only=False",
                e,
            )

    # As a backup, register the class globally when supported
    # pylint: disable=using-constant-test
    add_safe_globals = (
        getattr(serialization, "add_safe_globals", None)
        if serialization
        else None
    )
    if add_safe_globals and omegaconf_classes is not None:
        try:
            add_safe_globals(omegaconf_classes)
        except (RuntimeError, TypeError, AttributeError) as e:
            logger.debug("torch.serialization.add_safe_globals failed: %s", e)

    # Final fallback: explicitly request full pickle loading (pre-2.6 behaviour)
    try:
        return torch.load(checkpoint_path, weights_only=False, **load_kwargs)
    except TypeError:
        # Older torch versions don't expose weights_only
        return torch.load(checkpoint_path, **load_kwargs)


def _expand_to_aspect_ratio(
    input_shape: Union[np.ndarray, List[float], Tuple[float, float]],
    target_aspect_ratio: Optional[Tuple[float, float]] = None,
) -> np.ndarray:
    """Expand bounding box dimensions to match a target aspect ratio.

    Args:
        input_shape: (width, height) of the current bounding box
        target_aspect_ratio: desired (width, height) aspect ratio

    Returns:
        numpy array of [width, height] expanded to match the target ratio while
        fully containing the original box
    """
    if target_aspect_ratio is None:
        return np.array(input_shape, dtype=np.float32)

    w, h = input_shape
    target_w, target_h = target_aspect_ratio
    if h / w < target_h / target_w:
        h = max(w * target_h / target_w, h)
    else:
        w = max(h * target_w / target_h, w)
    return np.array([w, h], dtype=np.float32)


def _gen_trans_from_patch_cv(
    c_x: float,
    c_y: float,
    src_width: float,
    src_height: float,
    dst_width: float,
    dst_height: float,
    scale: float,
    rot: float,
) -> np.ndarray:
    """Generate an affine transformation matrix for cropping a patch.

    Args:
        c_x: center x coordinate of the source crop
        c_y: center y coordinate of the source crop
        src_width: width of the source crop
        src_height: height of the source crop
        dst_width: width of the destination patch
        dst_height: height of the destination patch
        scale: scaling factor
        rot: rotation angle in degrees

    Returns:
        2x3 affine transformation matrix
    """
    src_w = src_width * scale
    src_h = src_height * scale

    rot_rad = np.pi * rot / 180
    sn, cs = np.sin(rot_rad), np.cos(rot_rad)

    src_center = np.array([c_x, c_y], dtype=np.float32)
    src_down = np.array([0, src_h * _CENTER_OFFSET], dtype=np.float32)
    src_right = np.array([src_w * _CENTER_OFFSET, 0], dtype=np.float32)

    rot_mat = np.array([[cs, -sn], [sn, cs]], dtype=np.float32)
    src_downdir = rot_mat @ src_down
    src_rightdir = rot_mat @ src_right

    dst_center = np.array(
        [dst_width * _CENTER_OFFSET, dst_height * _CENTER_OFFSET],
        dtype=np.float32,
    )
    dst_downdir = np.array([0, dst_height * _CENTER_OFFSET], dtype=np.float32)
    dst_rightdir = np.array([dst_width * _CENTER_OFFSET, 0], dtype=np.float32)

    src = np.stack(
        [src_center, src_center + src_downdir, src_center + src_rightdir]
    )
    dst = np.stack(
        [dst_center, dst_center + dst_downdir, dst_center + dst_rightdir]
    )

    return cv2.getAffineTransform(
        src.astype(np.float32), dst.astype(np.float32)
    )


def _generate_image_patch_cv2(
    img: np.ndarray,
    c_x: float,
    c_y: float,
    bb_width: float,
    bb_height: float,
    patch_width: float,
    patch_height: float,
    do_flip: bool,
    scale: float,
    rot: float,
    border_mode: int = cv2.BORDER_CONSTANT,
    border_value: int = 0,
) -> Tuple[np.ndarray, np.ndarray]:
    """Extract an image patch using affine transformation.

    Args:
        img: input image (HWC)
        c_x: center x coordinate of the crop
        c_y: center y coordinate of the crop
        bb_width: width of the bounding box
        bb_height: height of the bounding box
        patch_width: width of the output patch
        patch_height: height of the output patch
        do_flip: whether to horizontally flip the image
        scale: scaling factor
        rot: rotation angle in degrees
        border_mode: OpenCV border mode
        border_value: border value for constant padding

    Returns:
        tuple of (patch image, transformation matrix)
    """
    if do_flip:
        img = img[:, ::-1, :]
        c_x = img.shape[1] - c_x - 1

    trans = _gen_trans_from_patch_cv(
        c_x, c_y, bb_width, bb_height, patch_width, patch_height, scale, rot
    )
    img_patch = cv2.warpAffine(
        img,
        trans,
        (int(patch_width), int(patch_height)),
        flags=cv2.INTER_LINEAR,
        borderMode=border_mode,
        borderValue=border_value,
    )
    return img_patch, trans


def _convert_cvimg_to_tensor(cvimg: np.ndarray) -> np.ndarray:
    """Convert an OpenCV image (HWC) to a tensor-ready format (CHW).

    Args:
        cvimg: image array in HWC format

    Returns:
        image array in CHW format
    """
    img = cvimg.transpose(2, 0, 1).astype(np.float32)
    return img


def _apply_antialias(
    img: np.ndarray, downsampling_factor: float
) -> np.ndarray:
    """Apply anti-aliasing blur to the image if significant downsampling is needed.

    Args:
        img: input image
        downsampling_factor: ratio of input size to output size

    Returns:
        blurred image if downsampling factor > _ANTIALIAS_DOWNSAMPLE_THRESHOLD,
        else original image
    """
    if downsampling_factor <= _ANTIALIAS_DOWNSAMPLE_THRESHOLD:
        return img

    sigma = max((downsampling_factor - 1.0) / _SIGMA_CALCULATION_FACTOR, 0.0)
    if sigma <= 0:
        return img

    if skimage_gaussian_filter is not None:
        return skimage_gaussian_filter(
            img, sigma=sigma, channel_axis=2, preserve_range=True
        ).astype(img.dtype)

    # Fallback to OpenCV Gaussian blur with an approximate kernel
    kernel = int(max(3, 2 * round(sigma * 3) + 1))
    return cv2.GaussianBlur(img, (kernel, kernel), sigmaX=sigma, sigmaY=sigma)


class _HRM2CropHelper:
    """Reimplements the 4D-Humans ViTDet cropping pipeline.

    The helper mirrors the preprocessing performed by
    ``hmr2.datasets.vitdet_dataset.ViTDetDataset`` so that both the
    detection-driven and single-image paths feed the HRM2 network crops that
    match the training distribution. It handles aspect-ratio expansion,
    optional anti-alias filtering, affine warping, and 0-255 mean/std
    normalization, and returns the canonical metadata required by
    ``cam_crop_to_full``.

    **All preprocessing operations are performed on CPU.**
    """

    def __init__(self, cfg: Any) -> None:
        image_size = getattr(cfg.MODEL, "IMAGE_SIZE", _DEFAULT_IMAGE_SIZE)
        target_h, target_w = get_target_size(image_size)
        self.patch_height = target_h
        self.patch_width = target_w
        self.mean = 255.0 * np.array(cfg.MODEL.IMAGE_MEAN, dtype=np.float32)
        self.std = 255.0 * np.array(cfg.MODEL.IMAGE_STD, dtype=np.float32)
        self.bbox_shape = getattr(cfg.MODEL, "BBOX_SHAPE", None)

    def __call__(
        self, img: np.ndarray, bbox: Optional[np.ndarray] = None
    ) -> Tuple[
        torch.Tensor,
        np.ndarray,
        float,
        np.ndarray,
        np.ndarray,
        Tuple[int, int],
    ]:
        """Preprocess image crop for HRM2 inference.

        Args:
            img: input image (HWC, RGB)
            bbox: optional bounding box [x1, y1, x2, y2] in absolute coordinates

        Returns:
            tuple of:
                - img_tensor: preprocessed image tensor (CHW, float, normalized)
                - center: box center [cx, cy]
                - bbox_size: size of the bounding box (scalar)
                - img_size: original image size [width, height]
                - transform: 2x3 affine transformation matrix used for cropping
                - crop_size: (crop_width, crop_height) of the output patch
        """
        if bbox is None:
            bbox = np.array(
                [0.0, 0.0, float(img.shape[1]), float(img.shape[0])],
                dtype=np.float32,
            )
        else:
            bbox = np.array(bbox, dtype=np.float32)

        # Convert RGB -> BGR for OpenCV parity with upstream pipeline
        img_cv2 = img[:, :, ::-1].copy()

        center = (bbox[2:4] + bbox[0:2]) / 2.0
        wh = bbox[2:4] - bbox[0:2]
        if self.bbox_shape is not None:
            wh = _expand_to_aspect_ratio(wh, self.bbox_shape)
        bbox_size = float(max(wh[0], wh[1]))

        downsampling_factor = (
            bbox_size / max(self.patch_height, self.patch_width)
        ) / 2.0
        img_cv2 = _apply_antialias(img_cv2, downsampling_factor)

        patch, transform = _generate_image_patch_cv2(
            img_cv2,
            center[0],
            center[1],
            bbox_size,
            bbox_size,
            self.patch_width,
            self.patch_height,
            False,
            1.0,
            0,
        )
        patch = patch[:, :, ::-1]  # back to RGB
        img_tensor = _convert_cvimg_to_tensor(patch)

        for c in range(min(img_tensor.shape[0], len(self.mean))):
            img_tensor[c] = (img_tensor[c] - self.mean[c]) / self.std[c]

        # All preprocessing is done on CPU - tensor created from numpy
        # is on CPU by default
        img_tensor = torch.from_numpy(img_tensor).float()
        img_size = np.array(
            [float(img.shape[1]), float(img.shape[0])], dtype=np.float32
        )
        crop_size = (self.patch_width, self.patch_height)
        return (
            img_tensor,
            center.astype(np.float32),
            bbox_size,
            img_size,
            transform,
            crop_size,
        )


class HRM2OutputProcessor(fout.OutputProcessor):
    """Converts HRM2 raw outputs to FiftyOne labels and metadata.

    This processor handles all postprocessing logic including tensor-to-Python
    conversion and label creation. Scene export is handled separately via
    ``export_hrm2_scene()``.

    **Output Structure:**
    - ``keypoints``: fol.Keypoints for 2D visualization
    - ``detections``: fol.Detections for 2D visualization
    - ``hrm2_people``: list of HRM2Person documents with SMPL metadata
    - ``smpl_faces``: face indices for 3D export
    - ``frame_size``: frame dimensions for 3D export

    **Resource Requirements:**
    - If ``export_meshes=True``, requires ``smpl_model`` to prepare mesh data
    - These resources are injected at runtime by HRM2Model._build_output_processor()
    - Config parameter export_meshes is set in HRM2Config

    Args:
        smpl_model (None): Optional SMPL model (torch.nn.Module) for mesh data.
            Required if export_meshes=True
        export_meshes (True): whether to prepare mesh data for later export.
            If True, requires smpl_model
        device (None): torch.device for SMPL model operations. Required if
            export_meshes=True
    """

    def __init__(
        self,
        smpl_model=None,
        export_meshes=True,
        device=None,
        **kwargs,
    ):
        super().__init__(**kwargs)
        self._smpl = smpl_model
        self.export_meshes = export_meshes
        self._device = device

        # Validate resource requirements
        if self.export_meshes and self._smpl is None:
            logger.warning(
                "export_meshes=True but no SMPL model provided. "
                "Scene metadata preparation will be disabled. "
                "To enable mesh export, provide smpl_model_path in HRM2Config."
            )
            self.export_meshes = False

        if self.export_meshes and self._device is None:
            logger.warning(
                "export_meshes=True but no device provided. "
                "This may cause issues during scene metadata preparation."
            )

    def __call__(
        self,
        outputs: List[Dict[str, Any]],
        **kwargs: Any,
    ) -> List[Dict[str, fol.Label]]:
        """Convert raw HRM2 outputs to dicts of FiftyOne labels and metadata.

        Args:
            outputs: List of raw output dicts from _forward_pass, each containing:
                - "people": List of person detection dicts with raw tensors
                - "img_shape": (height, width) of the source image
            **kwargs: additional arguments from OutputProcessor interface (unused)

        Returns:
            List of dicts per image containing Keypoints, Detections, HRM2Person
            documents, and export data (smpl_faces, frame_size)
        """
        results = []

        for output in outputs:
            people_data = [
                self._process_person(person_raw)
                for person_raw in output["people"]
            ]

            img_shape = output.get("img_shape")
            bundle_people = people_data
            smpl_faces = None
            bundle_frame_size = (
                list(img_shape) if img_shape is not None else None
            )

            if self._smpl is not None and self.export_meshes and people_data:
                scene_data = self._prepare_scene_data(people_data, img_shape)
                bundle_people = scene_data["people"]
                smpl_faces = scene_data["smpl_faces"]
                bundle_frame_size = scene_data["frame_size"]

            bundle = self._build_pose_outputs(
                bundle_people,
                img_shape,
                smpl_faces,
                bundle_frame_size,
            )
            results.append(bundle)

        return results

    @staticmethod
    def _process_person(person_raw: Dict[str, Any]) -> Dict[str, Any]:
        """Convert a single person's raw tensors to Python types.

        All postprocessing is done on CPU - tensors are explicitly moved to CPU
        before conversion to Python native types. If crop metadata is present,
        transforms 2D keypoints from crop space to full image coordinates.

        Args:
            person_raw: Dict with raw tensor outputs from model

        Returns:
            Dict with Python native types ready for MongoDB serialization
        """
        # Helper to safely convert tensors to lists (all postprocessing on CPU)
        def to_list(x):
            if x is None:
                return None
            if isinstance(x, torch.Tensor):
                return x.cpu().numpy().tolist()
            if isinstance(x, np.ndarray):
                return x.tolist()
            return x

        # Convert 2D keypoints from crop space to full image space if metadata available
        keypoints_2d_full = None
        if person_raw.get("pred_keypoints_2d") is not None:
            # Extract crop metadata
            crop_transform = person_raw.get("crop_transform")
            crop_window = person_raw.get("crop_window")
            img_size = person_raw.get("img_size")

            if (
                crop_transform is not None
                and crop_window is not None
                and img_size is not None
            ):
                # Convert to numpy for transformation
                kpts_crop = person_raw["pred_keypoints_2d"]
                if isinstance(kpts_crop, torch.Tensor):
                    kpts_crop = kpts_crop.cpu().numpy()

                # Transform keypoints to full image space
                try:
                    keypoints_2d_full = keypoints_crop_to_full(
                        kpts_crop, crop_transform, crop_window, img_size
                    )
                except (cv2.error, ValueError, RuntimeError) as e:
                    logger.warning(
                        "Failed to transform keypoints to full image space: %s. "
                        "Using crop-space keypoints.",
                        e,
                    )
                    keypoints_2d_full = kpts_crop
            else:
                # No crop metadata, use crop-space keypoints as-is
                kpts_crop = person_raw["pred_keypoints_2d"]
                if isinstance(kpts_crop, torch.Tensor):
                    keypoints_2d_full = kpts_crop.cpu().numpy()
                else:
                    keypoints_2d_full = kpts_crop

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
            "keypoints_2d": to_list(keypoints_2d_full),
            "vertices": to_list(person_raw.get("pred_vertices")),
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

        return fou.numpy_to_python(person_dict)

    def _prepare_scene_data(
        self,
        people_data: List[Dict],
        img_shape: Optional[Tuple[int, int]] = None,
    ) -> Dict:
        """Prepare all data needed for scene export.

        This method applies coordinate transformations to vertices and collects
        all metadata needed for later export. No files are written.

        Args:
            people_data: list of person detection dictionaries (processed)
            img_shape: optional (height, width) for camera setup

        Returns:
            Dict with:
                - people: List of per-person dicts with transformed vertices
                - smpl_faces: numpy array (F, 3) - mesh topology
                - frame_size: [height, width] for camera setup
        """
        import trimesh

        # Process each person's vertices with coordinate transformations
        processed_people = []
        for person in people_data:
            person_id = person["person_id"]

            # Get vertices from HMR2 output (already computed)
            vertices = np.array(person["vertices"])

            # Translate into camera frame before applying coordinate system flip
            if (
                "camera_translation" in person
                and person["camera_translation"] is not None
            ):
                cam_t = np.array(person["camera_translation"])
                vertices = vertices + cam_t
            else:
                logger.warning(
                    "Camera translation not found for person %s", person_id
                )

            # **CRITICAL: Apply 180° rotation around X-axis to fix
            # coordinate system**
            # This converts from SMPL (Y-up) to rendering (Y-down)
            rot_matrix = trimesh.transformations.rotation_matrix(
                np.radians(180), [1, 0, 0]
            )
            vertices_homogeneous = np.hstack(
                [vertices, np.ones((vertices.shape[0], 1))]
            )
            vertices = (rot_matrix @ vertices_homogeneous.T).T[:, :3]

            # Store transformed vertices and other person data
            processed_people.append(
                {
                    "vertices": vertices.tolist(),  # Convert to list for serialization
                    "person_id": person_id,
                    "bbox": person.get("bbox"),
                    "smpl_params": person.get("smpl_params"),
                    "keypoints_3d": person.get("keypoints_3d"),
                    "keypoints_2d": person.get("keypoints_2d"),
                    "camera_translation": person.get("camera_translation"),
                }
            )

        # Prepare scene metadata
        frame_size = list(img_shape) if img_shape is not None else [512, 512]

        # Convert SMPL faces from torch.Tensor to NumPy array (int64)
        # FiftyOne's ArrayField requires NumPy arrays, not tensors
        if isinstance(self._smpl.faces, torch.Tensor):
            smpl_faces = self._smpl.faces.cpu().numpy().astype(np.int64)
        else:
            smpl_faces = np.asarray(self._smpl.faces, dtype=np.int64)

        scene_data = {
            "people": processed_people,
            "smpl_faces": smpl_faces,  # NumPy array for FiftyOne compatibility
            "frame_size": frame_size,
        }

        return scene_data

    @staticmethod
    def _normalize_bbox(
        bbox: Optional[List[float]],
        width: Optional[float],
        height: Optional[float],
    ) -> Optional[List[float]]:
        if bbox is None or width is None or height is None:
            return None

        x1, y1, x2, y2 = bbox
        return [
            x1 / width,
            y1 / height,
            (x2 - x1) / width,
            (y2 - y1) / height,
        ]

    @staticmethod
    def _normalize_keypoints(
        keypoints: Optional[List[List[float]]],
        width: Optional[float],
        height: Optional[float],
    ) -> Tuple[Optional[List[List[float]]], Optional[List[float]]]:
        if keypoints is None or width is None or height is None:
            return None, None

        points = np.asarray(keypoints, dtype=np.float32)
        confidence = None

        if points.shape[1] == 3:
            confidence = points[:, 2].tolist()
            points = points[:, :2]

        points[:, 0] /= width
        points[:, 1] /= height

        return points.tolist(), confidence

    def _build_pose_outputs(
        self,
        people_data: List[Dict[str, Any]],
        img_shape: Optional[Tuple[int, int]],
        smpl_faces: Optional[np.ndarray],
        frame_size: Optional[List[int]],
    ) -> Dict[str, Any]:
        """Build outputs using existing labels + DynamicEmbeddedDocuments.

        This method creates:
        - Keypoints/Detections: existing FiftyOne labels for 2D visualization
        - HRM2Person documents: structured metadata for SMPL params, 3D data

        The 3D scene export is handled separately via export_hrm2_scene().

        Args:
            people_data: list of per-person prediction dicts
            img_shape: (height, width) of source image
            smpl_faces: SMPL face indices, shape (F, 3)
            frame_size: [height, width] for scene export

        Returns:
            dict with keys:
                - "keypoints": fol.Keypoints for 2D visualization
                - "detections": fol.Detections for 2D visualization
                - "hrm2_people": list of HRM2Person documents
                - "smpl_faces": face indices for export
                - "frame_size": frame dimensions for export
        """
        width = height = None
        if img_shape is not None:
            height, width = img_shape

        keypoints_list = []
        detections_list = []
        hrm2_people = []

        for person_dict in people_data:
            # ----------------------------------------------------------
            # 1. Create 2D Keypoint (existing label - for App visualization)
            # ----------------------------------------------------------
            keypoints_rel = None
            confidence = None
            keypoints_abs = person_dict.get("keypoints_2d")
            if keypoints_abs is not None:
                keypoints_rel, confidence = self._normalize_keypoints(
                    keypoints_abs, width, height
                )

            if keypoints_rel is not None:
                keypoint_kwargs = {
                    "label": "person",
                    "points": keypoints_rel,
                }
                if confidence is not None:
                    keypoint_kwargs["confidence"] = confidence
                keypoints_list.append(fol.Keypoint(**keypoint_kwargs))

            # ----------------------------------------------------------
            # 2. Create 2D Detection (existing label - for App visualization)
            # ----------------------------------------------------------
            bbox_rel = self._normalize_bbox(
                person_dict.get("bbox"), width, height
            )
            if bbox_rel is not None:
                detections_list.append(
                    fol.Detection(
                        label="person",
                        bounding_box=bbox_rel,
                    )
                )

            # ----------------------------------------------------------
            # 3. Create HRM2Person metadata (DynamicEmbeddedDocument)
            # ----------------------------------------------------------
            smpl_dict = person_dict.get("smpl_params", {})

            # Create SMPLParams embedded document
            smpl_params_doc = SMPLParams(
                body_pose=smpl_dict.get("body_pose"),
                betas=smpl_dict.get("betas"),
                global_orient=smpl_dict.get("global_orient"),
            )

            # Create HRM2Person with all data
            person_meta = HRM2Person(
                person_id=person_dict.get("person_id"),
                smpl_params=smpl_params_doc,
                camera_weak_perspective=smpl_dict.get("camera"),
                camera_translation=person_dict.get("camera_translation"),
                keypoints_3d=person_dict.get("keypoints_3d"),
                keypoints_2d_normalized=keypoints_rel,
                vertices=person_dict.get("vertices"),
                bbox=person_dict.get("bbox"),
            )
            hrm2_people.append(person_meta)

        # Build output bundle
        bundle: Dict[str, Any] = {}
        if keypoints_list:
            bundle["keypoints"] = fol.Keypoints(keypoints=keypoints_list)
        if detections_list:
            bundle["detections"] = fol.Detections(detections=detections_list)
        if hrm2_people:
            bundle["hrm2_people"] = hrm2_people

        # Include data needed for 3D export
        bundle["smpl_faces"] = smpl_faces
        bundle["frame_size"] = frame_size

        return bundle


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


def load_hrm2_model(  # pylint: disable=unused-argument
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
        ) from e

    # Resolve model config path
    if model_config_path is None:
        model_config_path = _resolve_hrm2_config_path(checkpoint_version)

    model_cfg = get_config(model_config_path, update_cachedir=True)
    logger.info("Using HRM2 model config at %s", model_config_path)

    # Validate critical SMPL resources referenced by the config
    try:
        smpl_model_dir = getattr(model_cfg.SMPL, "MODEL_PATH", None)
        smpl_mean_params = getattr(model_cfg.SMPL, "MEAN_PARAMS", None)
        smpl_joint_reg = getattr(model_cfg.SMPL, "JOINT_REGRESSOR_EXTRA", None)
    except AttributeError:
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
        logger.info("Loaded HRM2 checkpoint from %s", checkpoint_path)
    else:
        logger.warning(
            "Checkpoint not found at %s. "
            "Model will use random initialization.",
            checkpoint_path,
        )

    return model


def load_smpl_model(smpl_model_path: str) -> Any:
    """Entrypoint function for loading SMPL models.

    The returned model is always on CPU. The caller (HRM2Model._load_model)
    is responsible for moving it to the appropriate device.

    Args:
        smpl_model_path: path to SMPL_NEUTRAL.pkl file

    Returns:
        loaded SMPL model (on CPU)

    Raises:
        FileNotFoundError: if SMPL model file doesn't exist
        ImportError: if smplx package is not installed
    """
    if not os.path.exists(smpl_model_path):
        raise FileNotFoundError(
            f"SMPL model not found at {smpl_model_path}. "
            f"Please register at https://smpl.is.tue.mpg.de/ to "
            f"obtain the SMPL_NEUTRAL.pkl file."
        )

    model = smplx.SMPL(
        model_path=os.path.dirname(smpl_model_path),
        gender="neutral",
        batch_size=1,
        create_transl=False,
    )
    logger.info("Loaded SMPL model from %s", smpl_model_path)

    return model


def apply_hrm2_to_dataset_as_groups(
    sample_collection: "fo.SampleCollection",
    model: "HRM2Model",
    label_field: str = "hrm2",
    batch_size: int = 1,
    num_workers: int = 4,
    image_slice_name: str = "image",
    scene_slice_name: str = "3d",
    output_dir: Optional[str] = None,
) -> "fo.Dataset":
    """Apply HRM2 model to a dataset and create grouped samples.

    This function converts an image dataset into a grouped dataset where each
    group contains:
    - An image slice with the original image, 2D keypoints, and HRM2 metadata
    - A 3D slice with the reconstructed mesh scene (.fo3d file)

    This is the standard FiftyOne pattern for linking 2D images with 3D
    reconstructions and enables 3D visualization in the FiftyOne App.

    Output fields on image samples:
        - ``{label_field}_keypoints``: Keypoints label for 2D visualization
        - ``{label_field}_detections``: Detections label for 2D visualization
        - ``{label_field}_people``: list of HRM2Person documents with metadata

    The 3D scene sample has only a filepath pointing to the .fo3d file.

    **Implementation Note**: This function creates a temporary dataset clone to
    run inference (required by apply_model), then transfers the results to a new
    grouped dataset. The temporary dataset is automatically deleted after use to
    prevent database clutter.

    Args:
        sample_collection: the FiftyOne dataset or view to process
        model: an HRM2Model instance
        label_field (str): base name for label fields
        batch_size (int): batch size for inference
        num_workers (int): number of workers for data loading
        image_slice_name (str): name for the image slice in groups
        scene_slice_name (str): name for the 3D scene slice in groups
        output_dir (None): directory for .fo3d scenes and meshes. If None,
            defaults to fo.config.model_zoo_dir/hrm2. Pass False to disable
            file export (in-memory labels only)

    Returns:
        the grouped dataset
    """
    # Reject grouped datasets upfront
    if sample_collection.media_type == "group":
        raise ValueError(
            "apply_hrm2_to_dataset_as_groups() expects a non-grouped dataset. "
            "The input dataset has media_type='group'."
        )

    # Set default output_dir if not specified
    if output_dir is None:
        output_dir = os.path.join(fo.config.model_zoo_dir, "hrm2")
        output_dir = fos.normalize_path(output_dir)
    elif output_dir is False:
        output_dir = None  # Disable export

    # Create output directory if it doesn't exist
    if output_dir:
        os.makedirs(output_dir, exist_ok=True)
        logger.info("Scene files will be exported to: %s", output_dir)

    # Create temporary dataset for inference
    # Note: apply_model requires a persistent dataset, so we clone to create one
    logger.info("Processing %d samples...", len(sample_collection))
    temp_dataset = sample_collection.clone()
    temp_dataset_name = temp_dataset.name

    # Field mapping for model outputs
    label_fields_map = {
        "keypoints": f"{label_field}_keypoints",
        "detections": f"{label_field}_detections",
        "hrm2_people": f"{label_field}_people",
        "smpl_faces": f"{label_field}_smpl_faces",
        "frame_size": f"{label_field}_frame_size",
    }

    # Wrap processing in try/finally to ensure cleanup
    try:
        # Apply model to get predictions (adds fields to temp_dataset)
        temp_dataset.apply_model(
            model,
            label_field=label_fields_map,
            batch_size=batch_size,
            num_workers=num_workers,
            output_dir=output_dir,
        )

        # Collect scene export metadata
        def _get_field(sample, field_name):
            try:
                return sample.get_field(field_name)
            except KeyError:
                return None

        # Export scenes and collect filepaths mapped to sample filepaths
        scene_paths_map = {}  # Maps image filepath -> scene filepath
        logger.info("Exporting 3D scenes...")
        for idx, sample in enumerate(temp_dataset.iter_samples()):
            # Get prediction data
            hrm2_people = _get_field(sample, label_fields_map["hrm2_people"])
            smpl_faces = _get_field(sample, label_fields_map["smpl_faces"])
            frame_size = _get_field(sample, label_fields_map["frame_size"])

            # Export scene if output_dir is provided and people data exists
            if output_dir and hrm2_people:
                # Check if any person has mesh vertices
                has_meshes = any(
                    getattr(p, "vertices", None) is not None
                    for p in hrm2_people
                )
                if has_meshes and smpl_faces is not None:
                    # Generate unique scene path
                    scene_filename = f"scene_{idx:06d}.fo3d"
                    scene_path = os.path.join(output_dir, scene_filename)

                    # Export scene using standalone function
                    try:
                        exported_scene_path = export_hrm2_scene(
                            hrm2_people=hrm2_people,
                            smpl_faces=smpl_faces,
                            frame_size=frame_size,
                            scene_path=scene_path,
                        )
                        scene_paths_map[sample.filepath] = exported_scene_path
                        logger.debug(
                            "Exported scene to %s", exported_scene_path
                        )
                    except (OSError, IOError, ValueError, ImportError) as e:
                        logger.warning(
                            "Failed to export scene for sample %d: %s", idx, e
                        )

        # Create new grouped dataset
        logger.info("Creating grouped dataset structure...")
        grouped_dataset = fo.Dataset()
        grouped_dataset.add_group_field("group", default=image_slice_name)

        # Create grouped samples with predictions and 3D scenes
        all_new_samples = []
        for sample in temp_dataset.iter_samples():
            # Create group
            group = fo.Group()

            # Create image sample with group and all original fields
            image_sample = fo.Sample(filepath=sample.filepath)
            image_sample["group"] = group.element(image_slice_name)

            # Copy all fields from original sample (including predictions)
            for field_name in sample.field_names:
                # Skip system fields that shouldn't be copied
                if field_name in [
                    "id",
                    "filepath",
                    "metadata",
                    "_media_type",
                    "group",
                ]:
                    continue
                value = _get_field(sample, field_name)
                if value is not None:
                    image_sample[field_name] = value

            all_new_samples.append(image_sample)

            # Create 3D scene sample if mesh was exported
            exported_scene_path = scene_paths_map.get(sample.filepath)
            if exported_scene_path is not None:
                # 3D scene sample - just the filepath, no labels needed
                scene_sample = fo.Sample(filepath=exported_scene_path)
                scene_sample["group"] = group.element(scene_slice_name)
                all_new_samples.append(scene_sample)

        # Add all samples at once - FiftyOne will detect groups automatically
        logger.info(
            "Adding %d samples to grouped dataset...", len(all_new_samples)
        )
        grouped_dataset.add_samples(all_new_samples)

        # Set BODY-25 skeleton for keypoint visualization in the App
        grouped_dataset.default_skeleton = get_hrm2_skeleton()
        grouped_dataset.save()
        logger.info("Set HRM2 (BODY-25) skeleton for keypoint visualization")

        num_groups = (
            len(scene_paths_map) if scene_paths_map else len(temp_dataset)
        )
        logger.info("Created grouped dataset with %d groups", num_groups)
        logger.info(
            "Dataset media type is now: %s", grouped_dataset.media_type
        )
        logger.info("Dataset group slices: %s", grouped_dataset.group_slices)

        return grouped_dataset

    finally:
        # Clean up temporary dataset to prevent database clutter
        if temp_dataset_name in fo.list_datasets():
            logger.debug(
                "Deleting temporary dataset '%s' used for inference",
                temp_dataset_name,
            )
            fo.delete_dataset(temp_dataset_name)


class HRM2Config(fout.TorchImageModelConfig, fozm.HasZooModel):
    """Configuration for running an :class:`HRM2Model`.

    Args:
        smpl_model_path (None): path to the SMPL_NEUTRAL.pkl file. Users must
            register at https://smpl.is.tue.mpg.de/ to obtain this file
        checkpoint_version ("2.0b"): version of HRM2 checkpoint to use
        export_meshes (True): whether to prepare 3D mesh data for later export.
            If True, HRM2Person documents will contain vertex data for export.
            Actual files are written when output_dir is provided to apply_model()
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

        # Configure output processor class and arguments
        # Config owns serializable args; runtime resources (smpl_model, device)
        # are injected in _build_output_processor()
        if d.get("output_processor_cls") is None:
            d["output_processor_cls"] = HRM2OutputProcessor

        if d.get("output_processor_args") is None:
            d["output_processor_args"] = {}

        # Set serializable output processor arguments from config
        # Note: runtime resources (smpl_model, device) will be injected later
        d["output_processor_args"].update(
            {
                "export_meshes": self.export_meshes,
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


class HRM2Model(
    fout.TorchImageModel,
    fom.SupportsGetItem,
):
    """Wrapper for evaluating HRM2.0 (4D-Humans) on images.

    HRM2.0 performs 3D human mesh reconstruction from single images, outputting
    SMPL body model parameters, 3D meshes, and keypoints.

    This model implements the SupportsGetItem mixin to enable efficient batch
    processing with PyTorch DataLoaders and the FiftyOne apply_model() framework.

    **Processing Pipeline:**
    - **Preprocessing**: All done on CPU (_HRM2CropHelper)
    - **Inference**: Tensors moved to device for forward pass only
    - **Postprocessing**: All done on CPU (_extract_predictions, _process_person)

    **Output Storage:**
    When export_meshes=True, 3D scenes (.fo3d) and meshes (.obj) are written
    to disk during apply_model(). The output location is controlled by the
    output_dir parameter:

    - If output_dir is specified: scenes written to that directory
    - If output_dir is None: no files written (labels have in-memory data only)
    - Recommended: use fo.config.model_zoo_dir + '/hrm2' for persistent storage

    Example:
        import fiftyone as fo
        import fiftyone.zoo as foz

        # Load model
        model = foz.load_zoo_model("hrm2-2.0b")

        # Option 1: Global model cache (default for apply_hrm2_to_dataset_as_groups)
        output_dir = os.path.join(fo.config.model_zoo_dir, "hrm2")

        # Option 2: Custom location
        output_dir = "/path/to/my/scenes"

        # Option 3: Disable file export (in-memory only)
        output_dir = None

        # Apply model with output control
        dataset.apply_model(
            model,
            label_field="pose3d",
            output_dir=output_dir  # Where .fo3d and .obj files go
        )

    Args:
        config: an :class:`HRM2Config`
    """

    def __init__(self, config: HRM2Config) -> None:
        # Set instance attributes BEFORE parent init (which calls _load_model)
        self._hmr2: Optional[Any] = None
        self._smpl: Optional[Any] = None
        self._preprocessor: Optional[_HRM2CropHelper] = None

        # Now initialize parent class
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
        """Load the HRM2 model and SMPL body model.

        **Loading Order (Critical for Output Processor Pattern):**
        1. Load HRM2 model via parent's entrypoint
        2. Load SMPL model (runtime resource needed by output processor)
        3. Build output processor and inject SMPL model + device

        This order allows the output processor to receive runtime resources
        (SMPL model, device) that can't be serialized in the config.
        """
        # Load HRM2 model using parent's entrypoint mechanism
        self._hmr2 = super()._load_model(config)

        # Load SMPL model separately if configured
        # This is a runtime resource that will be injected into the output processor
        if config.smpl_model_path:
            self._smpl = load_smpl_model(
                smpl_model_path=config.smpl_model_path
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

        # Build output processor AFTER loading all resources
        # This allows _build_output_processor() to inject runtime resources
        # (self._smpl, self._device) into the processor
        self._output_processor = self._build_output_processor()

        return self._hmr2

    def _build_output_processor(
        self, config: Optional[HRM2Config] = None
    ) -> Optional[HRM2OutputProcessor]:
        """Build the output processor with runtime resource injection.

        This method:
        1. Starts with config.output_processor_args (set in HRM2Config.__init__)
        2. Injects runtime resources that can't be serialized (SMPL model, device)
        3. Builds the processor
        4. Cleans up non-serializable objects from config (for JSON export)

        This separation allows:
        - Config to be serialized to JSON
        - Runtime resources to be passed to processor
        - Clean separation of concerns

        Args:
            config: optional config (parent class passes this, but we use self.config)
        """
        if config is None:
            config = self.config

        if config.output_processor_cls is None:
            return None

        # Start with config's output_processor_args
        # (already set in HRM2Config.__init__)
        # These are serializable parameters: export_meshes
        if not config.output_processor_args:
            config.output_processor_args = {}

        args = config.output_processor_args.copy()

        # Inject runtime resources that couldn't be in config
        # (These are non-serializable: loaded model objects, device objects)
        args.update(
            {
                "smpl_model": self._smpl,  # Loaded SMPL model (torch.nn.Module)
                "device": self._device,  # torch.device object
            }
        )

        # Build processor using parent's class resolution logic
        output_processor_cls = config.output_processor_cls
        if etau.is_str(output_processor_cls):
            output_processor_cls = etau.get_class(output_processor_cls)

        # Pass classes if available (may not be set yet during _load_model)
        # The parent will call this again after setting _classes
        processor = output_processor_cls(
            classes=getattr(self, "_classes", None), **args
        )

        # Clean up non-serializable objects from config for JSON export
        if config.output_processor_args:
            config.output_processor_args.pop("smpl_model", None)
            config.output_processor_args.pop("device", None)

        return processor

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
                the model's config.

        Returns:
            an :class:`HRM2GetItem` instance
        """
        # Copy field_mapping to avoid mutating caller's dict
        if field_mapping is None:
            field_mapping = {}
        else:
            field_mapping = dict(field_mapping)

        # Auto-add prompt_field if we have a detections field
        # Check field_mapping first (pop to avoid validation errors), then config
        if "prompt_field" not in field_mapping:
            # Pop detections_field alias if present to avoid unknown-key errors
            prompt_field = field_mapping.pop("detections_field", None)

            # Fall back to config if not in field_mapping
            if prompt_field is None:
                prompt_field = getattr(self.config, "detections_field", None)

            if prompt_field:
                # Handle video frames
                if prompt_field.startswith("frames."):
                    prompt_field = prompt_field[len("frames.") :]

                field_mapping["prompt_field"] = prompt_field

        return HRM2GetItem(
            field_mapping=field_mapping if field_mapping else None,
            transform=self._transforms,
            use_numpy=False,
        )

    def predict(
        self, img: Union[Image.Image, np.ndarray, torch.Tensor]
    ) -> Dict[str, fol.Label]:
        """Run HRM2 inference on a single image and return a label bundle.

        This method performs single-person 3D human mesh reconstruction on the
        provided image. For multi-person scenarios or dataset-level inference,
        use dataset.apply_model() with the detections_field parameter.

        Args:
            img: input image as PIL.Image, numpy array (HWC), or torch.Tensor

        Returns:
            Dict containing Keypoints, Detections, HRM2Person documents,
            and export data (smpl_faces, frame_size)
        """
        return self.predict_all([img])[0]

    def predict_all(
        self,
        imgs: List[
            Union[Image.Image, np.ndarray, torch.Tensor, Dict[str, Any]]
        ],
        samples: Optional[Any] = None,  # pylint: disable=unused-argument
    ) -> List[Dict[str, fol.Label]]:
        """Run HRM2 inference on a list of images or batch data.

        This method performs single-person 3D human mesh reconstruction on each
        image in the list. For multi-person scenarios or dataset-level inference,
        use dataset.apply_model() with the detections_field parameter.

        Args:
            imgs: list of images (PIL.Image, numpy array, or torch.Tensor) OR
                list of dicts from GetItem with 'image', 'detections', 'filepath'
            samples: optional FiftyOne samples (not used for direct predict)

        Returns:
            list of dicts containing HRM2 predictions, one per image
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

    def _get_preprocessor(self) -> _HRM2CropHelper:
        if self._hmr2 is None:
            raise RuntimeError(
                "HRM2 model must be loaded before preprocessing images"
            )
        if self._preprocessor is None:
            self._preprocessor = _HRM2CropHelper(self._hmr2.cfg)
        return self._preprocessor

    def _predict_all(  # pylint: disable=arguments-renamed
        self, batch_data: List[Dict[str, Any]]
    ) -> List[Dict[str, fol.Label]]:
        """Process batch and return label bundles via output processor.

        This method receives data from the GetItem instance, performs inference
        via _forward_pass(), and converts raw outputs to FiftyOne labels and
        HRM2Person metadata using the output processor.

        Args:
            batch_data: list of dicts from GetItem, each containing:
                - 'image': the loaded image (PIL/numpy/tensor)
                - 'detections': fol.Detections object or None
                - 'filepath': path to the source image

        Returns:
            list of label dicts (if processor exists) or raw outputs
        """
        # Get raw outputs from forward pass
        raw_outputs = self._forward_pass(batch_data)

        # If no processor, return raw outputs
        if self._output_processor is None:
            return raw_outputs

        # Process through output processor
        return self._output_processor(raw_outputs)

    def _forward_pass(  # pylint: disable=arguments-renamed
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

        for data in batch_data:
            img = data["image"]
            detections = data.get("detections")

            # Process based on detection mode
            if detections is not None and len(detections.detections) > 0:
                output = self._inference_with_detections(img, detections)
            else:
                output = self._inference_single_person(img)

            # Carry filepath through for UID generation in output processor
            output["filepath"] = data.get("filepath")

            raw_outputs.append(output)

        return raw_outputs

    def _run_inference(self, img_t: torch.Tensor) -> Dict[str, Any]:
        """Run HMR2 inference on preprocessed tensor.

        The input tensor (preprocessed on CPU) is moved to the model's device
        for inference. All preprocessing happens on CPU before this call, and
        all postprocessing (via _extract_predictions) happens on CPU after.

        Args:
            img_t: preprocessed image tensor (CHW, float, normalized) on CPU

        Returns:
            dict with HMR2 model outputs including SMPL parameters and keypoints
        """
        # Move preprocessed CPU tensor to device for inference
        batch_t = img_t.unsqueeze(0).to(self._device)

        # Convert to half precision if configured
        if self.config.use_half_precision:
            batch_t = batch_t.half()

        batch = {"img": batch_t}
        with torch.no_grad():
            return self._hmr2(batch)

    def _extract_predictions(  # pylint: disable=no-self-use
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

        All postprocessing is done on CPU - all tensors are explicitly moved
        to CPU before conversion to numpy arrays.

        Args:
            outputs: dict from HMR2 model containing predictions

        Returns:
            tuple of (pred_cam, pred_pose, pred_betas, pred_global_orient,
                     pred_keypoints_3d, pred_keypoints_2d) as numpy arrays
        """
        # All postprocessing on CPU - explicitly move tensors from device
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

    def _build_person_raw(  # pylint: disable=no-self-use
        self,
        pred_cam: np.ndarray,
        pred_pose: np.ndarray,
        pred_betas: np.ndarray,
        pred_global_orient: np.ndarray,
        pred_keypoints_3d: np.ndarray,
        pred_keypoints_2d: Optional[np.ndarray],
        pred_vertices: np.ndarray,
        person_id: int = 0,
        bbox: Optional[List[float]] = None,
        camera_translation: Optional[np.ndarray] = None,
        crop_transform: Optional[np.ndarray] = None,
        crop_window: Optional[Tuple[int, int]] = None,
        img_size: Optional[np.ndarray] = None,
    ) -> Dict[str, Any]:
        """Build raw person detection dictionary with tensors on CPU.

        All postprocessing is done on CPU. This returns raw outputs (tensors
        explicitly placed on CPU) for processing by the output processor.
        No conversion to Python types is performed here.

        Args:
            pred_cam: camera parameters [s, tx, ty]
            pred_pose: SMPL body pose parameters
            pred_betas: SMPL shape parameters
            pred_global_orient: SMPL global orientation
            pred_keypoints_3d: 3D keypoint locations
            pred_keypoints_2d: optional 2D keypoint locations (in crop space)
            pred_vertices: 3D mesh vertices from HMR2
            person_id: person identifier
            bbox: optional bounding box [x1, y1, x2, y2]
            camera_translation: optional camera translation [tx, ty, tz]
            crop_transform: optional 2x3 affine transformation matrix for crop
            crop_window: optional (crop_width, crop_height) tuple
            img_size: optional original image size [width, height]

        Returns:
            person detection dictionary with raw tensors and crop metadata
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
            "pred_vertices": torch.from_numpy(pred_vertices).cpu()
            if isinstance(pred_vertices, np.ndarray)
            else pred_vertices,
            "bbox": bbox,
            "person_id": person_id,
        }

        if camera_translation is not None:
            person_dict["camera_translation"] = (
                torch.from_numpy(camera_translation).cpu()
                if isinstance(camera_translation, np.ndarray)
                else camera_translation
            )

        # Store crop metadata for keypoint reprojection
        if crop_transform is not None:
            person_dict["crop_transform"] = crop_transform
        if crop_window is not None:
            person_dict["crop_window"] = crop_window
        if img_size is not None:
            person_dict["img_size"] = img_size

        return person_dict

    def _inference_with_detections(
        self,
        img: Union[Image.Image, np.ndarray, torch.Tensor],
        detections: fol.Detections,
    ) -> Dict[str, Any]:
        """Run inference using provided detections (multi-person mode).

        Args:
            img: image from GetItem (PIL/numpy/tensor)
            detections: fol.Detections object with bounding boxes

        Returns:
            raw output dict with 'people' list (raw tensors) and 'img_shape'
        """
        # Convert to numpy and ensure RGB
        img_np = fout.to_numpy_image(img)
        img_np = ensure_rgb_numpy(img_np)

        # Convert detections to boxes
        boxes = detections_to_boxes(detections, img_np)

        if boxes is None or len(boxes) == 0:
            logger.warning(
                "No valid boxes for image, using single-person mode"
            )
            return self._inference_single_person(img)

        logger.debug("Processing %d people in image", len(boxes))

        # Process each person - returns raw tensors
        people_data = [
            self._inference_person_crop(img_np, box, person_idx)
            for person_idx, box in enumerate(boxes)
        ]

        return {
            "people": people_data,
            "img_shape": (img_np.shape[0], img_np.shape[1]),  # (height, width)
        }

    def _inference_person_crop(
        self,
        img_np: np.ndarray,
        box: np.ndarray,
        person_idx: int,
    ) -> Dict[str, Any]:
        """Run inference on a single person crop from the image.

        Args:
            img_np: image as numpy array (HWC uint8)
            box: bounding box [x1, y1, x2, y2] in absolute coordinates
            person_idx: person index within the image

        Returns:
            person detection dict with raw tensors
        """
        x1, y1, x2, y2 = box

        preprocessor = self._get_preprocessor()
        (
            img_crop_t,
            box_center,
            crop_size,
            img_size,
            transform,
            crop_window,
        ) = preprocessor(img_np, np.array([x1, y1, x2, y2], dtype=np.float32))

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

        # Extract vertices from outputs
        pred_vertices = outputs["pred_vertices"][0].cpu().numpy()

        # Transform camera from crop to full image space
        image_size = getattr(self._hmr2.cfg.MODEL, "IMAGE_SIZE", 256)
        target_h, target_w = get_target_size(image_size)
        target_size = max(target_h, target_w)  # Get max of (h, w)
        focal_length = (
            self._hmr2.cfg.EXTRA.FOCAL_LENGTH / target_size * img_size.max()
        )

        cam_t_full = cam_crop_to_full(
            pred_cam, box_center, crop_size, img_size, focal_length
        )

        # Build raw person data (tensors on CPU)
        # Pass crop metadata for keypoint reprojection
        return self._build_person_raw(
            pred_cam,
            pred_pose,
            pred_betas,
            pred_global_orient,
            pred_keypoints_3d,
            pred_keypoints_2d,
            pred_vertices,
            person_id=person_idx,
            bbox=[float(x1), float(y1), float(x2), float(y2)],
            camera_translation=cam_t_full,
            crop_transform=transform,
            crop_window=crop_window,
            img_size=img_size,
        )

    def _inference_single_person(
        self,
        img: Union[Image.Image, np.ndarray, torch.Tensor],
    ) -> Dict[str, Any]:
        """Run inference on full image in single-person mode.

        Args:
            img: image from GetItem (PIL/numpy/tensor)

        Returns:
            raw output dict with single person in 'people' list and 'img_shape'
        """
        # Convert to numpy and ensure RGB ordering
        img_np = fout.to_numpy_image(img)
        img_np = ensure_rgb_numpy(img_np)
        img_shape = (img_np.shape[0], img_np.shape[1])  # (height, width)

        # Use shared preprocessor to mirror ViTDet cropping pipeline
        preprocessor = self._get_preprocessor()
        (
            img_crop_t,
            box_center,
            crop_size,
            img_size,
            transform,
            crop_window,
        ) = preprocessor(img_np)

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

        # Extract vertices from outputs
        pred_vertices = outputs["pred_vertices"][0].cpu().numpy()

        # Project camera parameters to full image coordinates
        image_size = getattr(self._hmr2.cfg.MODEL, "IMAGE_SIZE", 256)
        target_h, target_w = get_target_size(image_size)
        target_size = max(target_h, target_w)
        focal_length = (
            self._hmr2.cfg.EXTRA.FOCAL_LENGTH / target_size * img_size.max()
        )
        cam_t_full = cam_crop_to_full(
            pred_cam, box_center, crop_size, img_size, focal_length
        )

        # Build raw person data
        # Pass crop metadata for keypoint reprojection
        person_data = self._build_person_raw(
            pred_cam,
            pred_pose,
            pred_betas,
            pred_global_orient,
            pred_keypoints_3d,
            pred_keypoints_2d,
            pred_vertices,
            person_id=0,
            bbox=None,
            camera_translation=cam_t_full,
            crop_transform=transform,
            crop_window=crop_window,
            img_size=img_size,
        )

        return {"people": [person_data], "img_shape": img_shape}
