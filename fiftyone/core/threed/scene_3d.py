"""
3D scene definitions.

| Copyright 2017-2024, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""
import json
from typing import Optional, List

from pydantic.dataclasses import dataclass

from .camera import PerspectiveCamera
from .lights import Light
from .object_3d import Object3D
from .utils import convert_keys_to_snake_case


@dataclass
class SceneBackground:
    """Represents the background of the scene.

    Args:
        color (str, optional): the background color of the scene
        image (str, optional): the path to the background image. Defaults to
            None. This takes precedence over color if provided
        cube (list, optional): the paths to the six faces of the background.
            The order of the faces is: +X, -X, +Y, -Y, +Z, -Z.
            Defaults to None. This takes precedence over the image and color if
            provided. This can be used to build a skybox.
        intensity (float, optional): the intensity of the background. Defaults
            to 1.0. This only applies for `image` and `cube` backgrounds
    """

    color: Optional[str] = None
    image: Optional[str] = None
    cube: Optional[List[str]] = None
    intensity: Optional[float] = 1.0

    def as_dict(self):
        return {
            "color": self.color,
            "image": self.image,
            "cube": self.cube,
            "intensity": self.intensity,
        }

    @staticmethod
    def _from_dict(d):
        return SceneBackground(
            color=d.get("color"),
            image=d.get("image"),
            cube=d.get("cube"),
            intensity=d.get("intensity"),
        )


class Scene(Object3D):
    """Represents a scene graph which contains a hierarchy of 3D objects.

    Args:
        camera (None): the default camera of the scene. If `None`, a default
            :class:`fiftyone.core.threed.PerspectiveCamera` is created with
            reasonable defaults
        lights (None): a list of lights in the scene. If `None`, a default set
            of lights is used, which includes an ambient light and a
            directional light
        background (None): background for the scene. May be a color, image, or
            a skybox.

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
        lights: Optional[List[Light]] = None,
        background: Optional[SceneBackground] = None,
    ):
        super().__init__(name="Scene", visible=True)

        if camera is None:
            camera = PerspectiveCamera()

        self.camera = camera
        self.lights = lights
        self.background = background

    def export(self, path: str):
        """Export the scene to a .fo3d file."""
        if not path.endswith(".fo3d"):
            raise ValueError("Scene must be exported to a .fo3d file")

        with open(path, "w") as f:
            json.dump(super().as_dict(), f, indent=4)

    def _to_dict_extra(self):
        return {
            "uuid": self.uuid,
            "camera": self.camera.as_dict(),
            "lights": [light.as_dict() for light in self.lights]
            if self.lights
            else None,
            "background": self.background.as_dict()
            if self.background
            else None,
        }

    @staticmethod
    def from_fo3d(path: str):
        """Load a scene from a .fo3d file."""
        if not path.endswith(".fo3d"):
            raise ValueError("Scene must be loaded from a .fo3d file")

        with open(path, "r") as f:
            dict_data = convert_keys_to_snake_case(json.load(f))

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

        # parse background
        background_dict = dict_data.get("background")
        if background_dict is not None:
            scene.background = SceneBackground._from_dict(background_dict)

        return scene
