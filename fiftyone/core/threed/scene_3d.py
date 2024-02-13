"""
Fiftyone 3D Scene.

| Copyright 2017-2024, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""
import json

from .object_3d import Object3D, Vector3
from pydantic.dataclasses import dataclass
from typing import List


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
