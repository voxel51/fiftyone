"""
| Copyright 2017-2024, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""
import json
from typing import Optional

from .camera import PerspectiveCamera
from .lights import Light
from .object_3d import Object3D


class Scene(Object3D):
    """Represents the scene graph and contains a hierarchy of Object3Ds.

    Args:
        camera (None): the default camera of the scene. If `None`, a default
            :class:`fiftyone.core.threed.PerspectiveCamera` is created with
            reasonable defaults
        lights (None): a list of lights in the scene. If `None`, a default set
            of lights is used, which includes an ambient light and a
            directional light

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

    def __init__(
        self,
        camera: Optional[PerspectiveCamera] = None,
        lights: Optional[list[Light]] = None,
    ):
        super().__init__(name="Scene", visible=True)

        if camera is None:
            camera = PerspectiveCamera()

        self.camera = camera
        self.lights = lights

    def export(self, path: str):
        """Export the scene to a .fo3d file."""
        if not path.endswith(".fo3d"):
            raise ValueError("Scene must be exported to a .fo3d file")

        with open(path, "w") as f:
            json.dump(super().as_dict(), f, indent=4)

    def _to_dict_extra(self):
        return {
            "camera": self.camera.as_dict(),
            "lights": [light.as_dict() for light in self.lights]
            if self.lights
            else None,
        }

    @staticmethod
    def from_fo3d(path: str):
        """Load a scene from a .fo3d file."""
        if not path.endswith(".fo3d"):
            raise ValueError("Scene must be loaded from a .fo3d file")

        with open(path, "r") as f:
            dict_data = json.load(f)

        scene: Scene = Scene._from_dict(dict_data)

        # parse camera
        camera_dict = dict_data.get("camera")
        if camera_dict is not None:
            scene.camera = PerspectiveCamera._from_dict(camera_dict)

        # parse lights
        lights_list = dict_data.get("lights")
        if lights_list is not None:
            scene.lights = [
                Light._from_dict(light_dict) for light_dict in lights_list
            ]

        return scene
