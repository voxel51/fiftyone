"""
Camera definition for 3D visualization.

| Copyright 2017-2025, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""

from dataclasses import dataclass
from typing import Literal, Optional, Union

from .transformation import Vector3, Vec3UnionType, normalize_to_vec3
from .validators import BaseValidatedDataClass, validate_choice, validate_float


UP_DIRECTIONS = frozenset(["X", "Y", "Z"])
UpDirection = Literal["X", "Y", "Z"]


@dataclass
class PerspectiveCamera(BaseValidatedDataClass):
    """Represents the configuration of a 3D perspective camera.

    Args:
        position (None): the position of the camera. If ``None``, the camera
            position is calculated based on the bounding box of the scene
        look_at (None): the point the camera is looking at. If ``None``, the
            camera looks at the center of the scene
        up (None): the orthonormal axis that is considered up. Must be one of
            "X", "Y", or "Z". If ``None``, it will fallback to the global
            ``up`` as defined in 3D plugin settings. If that too is not
            defined, it will fallback to "Y"
        aspect (None): the aspect ratio of the camera. If ``None``, the aspect
            ratio is calculated based on the width and height of the canvas
        fov (50): camera frustum vertical field of view in degrees. If
            ``None``, the field of view is 50 degrees
        near (0.1): the near clipping plane of the camera
        far (2000): the far clipping plane of the camera
    """

    def __init__(
        self,
        position: Optional[Vector3] = None,
        look_at: Optional[Vector3] = None,
        up: Optional[UpDirection] = None,
        aspect: Optional[float] = None,
        fov: float = 50.0,
        near: float = 0.1,
        far: float = 2000.0,
    ):
        self.position = position
        self.look_at = look_at
        self.up = up
        self.aspect = aspect
        self.fov = fov
        self.near = near
        self.far = far

    @property
    def position(self) -> Vector3:
        return self._position

    @position.setter
    def position(self, value: Vec3UnionType) -> None:
        self._position = normalize_to_vec3(value)

    @property
    def look_at(self) -> Vector3:
        return self._look_at

    @look_at.setter
    def look_at(self, value: Vec3UnionType) -> None:
        self._look_at = normalize_to_vec3(value)

    @property
    def up(self) -> Union[str, None]:
        return self._up

    @up.setter
    def up(self, value):
        self._up = validate_choice(value, UP_DIRECTIONS, True)

    @property
    def aspect(self):
        return self._aspect

    @aspect.setter
    def aspect(self, value: Optional[float]) -> None:
        self._aspect = validate_float(value, nullable=True)

    @property
    def fov(self) -> float:
        return self._fov

    @fov.setter
    def fov(self, value: float) -> None:
        self._fov = validate_float(value)

    @property
    def near(self) -> float:
        return self._near

    @near.setter
    def near(self, value: float) -> None:
        self._near = validate_float(value)

    @property
    def far(self) -> float:
        return self._far

    @far.setter
    def far(self, value: float) -> None:
        self._far = validate_float(value)

    def as_dict(self) -> dict:
        return {
            "position": (
                self.position.to_arr().tolist() if self.position else None
            ),
            "lookAt": self.look_at.to_arr().tolist() if self.look_at else None,
            "aspect": self.aspect,
            "up": self.up,
            "fov": self.fov,
            "near": self.near,
            "far": self.far,
        }

    @staticmethod
    def _from_dict(d: dict):
        return PerspectiveCamera(
            position=d.get("position"),
            look_at=d.get("lookAt"),
            up=d.get("up"),
            fov=d.get("fov"),
            aspect=d.get("aspect"),
            near=d.get("near"),
            far=d.get("far"),
        )
