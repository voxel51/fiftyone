"""
| Copyright 2017-2024, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""
from typing import Literal, Optional

from pydantic.dataclasses import dataclass

from .transformation import Vec3UnionType
from .validators import vec3_normalizing_validator


@dataclass
class PerspectiveCamera:
    """Represents the configuration of a 3D perspective camera.

    Args:
        position (None): the position of the camera. If `None`, the camera
            position is calculated based on the bounding box of the scene
        look_at (None): the point the camera is looking at. If `None`, the
            camera looks at the center of the scene
        up ("Z"): the orthonormal axis that is considered up. Must be one of
            "X", "Y", or "Z"
        fov (50): camera frustum vertical field of view in degrees. If
            `None`, the field of view is 50 degrees
        aspect (1): the aspect ratio of the camera. If `None`, the aspect
            ratio is 1, assuming a square viewport
        near (0.1): the near clipping plane of the camera
        far (2000): the far clipping plane of the camera
        background_image_path (None): path to a reference image displayed
            behind objects in the scene
    """

    position: Optional[Vec3UnionType] = None
    look_at: Optional[Vec3UnionType] = None
    up: Literal["Z", "Y", "X"] = "Z"

    fov: float = 50
    aspect: float = 1
    near: float = 0.1
    far: float = 2000
    background_image_path: Optional[str] = None

    _ensure_position_is_normalized = vec3_normalizing_validator("position")
    _ensure_look_at_is_normalized = vec3_normalizing_validator("look_at")

    def as_dict(self):
        return {
            "position": self.position.to_arr().tolist()
            if self.position
            else None,
            "look_at": self.look_at.to_arr().tolist()
            if self.look_at
            else None,
            "up": self.up,
            "fov": self.fov,
            "aspect": self.aspect,
            "near": self.near,
            "far": self.far,
            "background_image_path": self.background_image_path,
        }

    @staticmethod
    def _from_dict(d):
        return PerspectiveCamera(
            position=d.get("position"),
            look_at=d.get("look_at"),
            up=d.get("up"),
            fov=d.get("fov"),
            aspect=d.get("aspect"),
            near=d.get("near"),
            far=d.get("far"),
            background_image_path=d.get("background_image_path"),
        )
