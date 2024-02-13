"""
Fiftyone 3D Scene.

| Copyright 2017-2024, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""
import json
from typing import List, Optional

from pydantic.dataclasses import dataclass

from .object_3d import Object3D
from .transformation import Vec3UnionType, Vector3
from .validators import vec3_normalizing_validator


@dataclass
class CameraConfig:
    """Represents the configuration of a 3D camera.

    Args:
        position (None): the position of the camera
        look_at (None): the point the camera is looking at
        up (None): the up vector of the camera
        fov (None): the field of view of the camera
        aspect (None): the aspect ratio of the camera
        near (None): the near clipping plane of the camera
        far (None): the far clipping plane of the camera
    """

    position: Optional[Vec3UnionType] = None
    look_at: Optional[Vec3UnionType] = None
    up: Optional[Vec3UnionType] = None

    fov: float | None = None
    aspect: float | None = None
    near: float | None = None
    far: float | None = None

    _ensure_position_is_normalized: classmethod = vec3_normalizing_validator(
        "position"
    )
    _ensure_look_at_is_normalized: classmethod = vec3_normalizing_validator(
        "look_at"
    )
    _ensure_up_is_normalized: classmethod = vec3_normalizing_validator("up")

    def as_dict(self):
        return {
            "position": self.position.to_arr().tolist()
            if self.position
            else None,
            "look_at": self.look_at.to_arr().tolist()
            if self.look_at
            else None,
            "up": self.up.to_arr().tolist() if self.up else None,
            "fov": self.fov,
            "aspect": self.aspect,
            "near": self.near,
            "far": self.far,
        }

    @staticmethod
    def from_dict(d):
        return CameraConfig(
            position=d.get("position"),
            look_at=d.get("look_at"),
            up=d.get("up"),
            fov=d.get("fov"),
            aspect=d.get("aspect"),
            near=d.get("near"),
            far=d.get("far"),
        )


@dataclass(frozen=True)
class SceneConfig:
    """Represents the configuration of a 3D scene."""

    default_camera_position: Vector3 | List[float] | None = None
    default_up = Vector3(0, 1, 0)


class Scene(Object3D):
    """Represents the scene graph and contains a hierarchy of Object3Ds.

    Args:
        default_camera_position (None): the default camera position to use when
            viewing the scene. If it is `None`, the default camera position is
            the bounding box of the scene.

    Usage::

            scene = Scene()

            obj_mesh = ObjMesh(obj_url="/path/to/obj", mtl_url="/path/to/mtl")
            gltf_mesh = GLTFMesh(gltf_url="/path/to/gltf")
            pcd = Pointcloud(pcd_url="/path/to/pcd")

            scene.add(mesh)
            scene.add(gltf_mesh)
            scene.add(pcd)

            scene.export("/path/to/scene.fo3d")

            dataset = fo.Dataset()
            dataset.add_sample(fo.Sample("/path/to/scene.fo3d"))

            assert dataset.media_type == "3d"
    """

    def __init__(self, default_camera_position: Vector3 | List[float] = None):
        super().__init__(name="Scene", visible=True)

        if default_camera_position is not None:
            if (
                isinstance(default_camera_position, list)
                and len(default_camera_position) == 3
            ):
                default_camera_position = Vector3(*default_camera_position)

            if not isinstance(default_camera_position, Vector3):
                raise ValueError(
                    "default_camera_position must be a Vector3 or a list of 3 "
                    "floats"
                )

        self._default_camera_position = default_camera_position

    def export(self, path: str):
        """Export the scene to a .fo3d file."""
        if not path.endswith(".fo3d"):
            raise ValueError("Scene must be exported to a .fo3d file")

        scene = super()._to_dict()

        with open(path, "w") as f:
            json.dump(scene, f)

    def _to_dict_extra(self):
        if self._default_camera_position:
            return {
                "default_camera_position": self._default_camera_position.to_arr().tolist(),
            }
        else:
            return {}

    @staticmethod
    def from_fo3d(path: str):
        """Load a scene from a .fo3d file."""
        if not path.endswith(".fo3d"):
            raise ValueError("Scene must be loaded from a .fo3d file")

        with open(path, "r") as f:
            dict_data = json.load(f)

        return Scene._from_dict(dict_data)
