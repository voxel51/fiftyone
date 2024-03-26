"""
Camera definition for 3D visualization.

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
        up (None): the orthonormal axis that is considered up. Must be one of
            "X", "Y", or "Z". If `None`, it'll fallback to the global `up` as
            defined in 3D plugin settings. If that too is not defined, it'll
            fallback to "Y"
        aspect (None): the aspect ratio of the camera. If `None`, the aspect
            ratio is calculated based on the width and height of the canvas.
        fov (50): camera frustum vertical field of view in degrees. If
            `None`, the field of view is 50 degrees
        near (0.1): the near clipping plane of the camera
        far (2000): the far clipping plane of the camera
    """

    position: Optional[Vec3UnionType] = None
    look_at: Optional[Vec3UnionType] = None
    up: Optional[Literal["Z", "Y", "X"]] = None
    aspect: Optional[float] = None

    fov: float = 50
    near: float = 0.1
    far: float = 2000

    _ensure_position_is_normalized = vec3_normalizing_validator("position")
    _ensure_look_at_is_normalized = vec3_normalizing_validator("look_at")

    def as_dict(self):
        return {
            "position": self.position.to_arr().tolist()
            if self.position
            else None,
            "lookAt": self.look_at.to_arr().tolist() if self.look_at else None,
            "aspect": self.aspect,
            "up": self.up,
            "fov": self.fov,
            "near": self.near,
            "far": self.far,
        }

    @staticmethod
    def _from_dict(d):
        return PerspectiveCamera(
            position=d.get("position"),
            look_at=d.get("lookAt"),
            up=d.get("up"),
            fov=d.get("fov"),
            aspect=d.get("aspect"),
            near=d.get("near"),
            far=d.get("far"),
        )
