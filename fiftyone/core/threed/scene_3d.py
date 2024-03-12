"""
3D scene definitions.

| Copyright 2017-2024, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""
import json
import os
from typing import List, Optional

from pydantic.dataclasses import dataclass

from .camera import PerspectiveCamera
from .lights import Light
from .mesh import FBXMesh, GLTFMesh, ObjMesh, PlyMesh, StlMesh
from .object_3d import Object3D
from .pointcloud import Pointcloud
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

            scene.write("/path/to/scene.fo3d")

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

    def __repr__(self):
        """Return a string representation of the scene."""
        nodes_summary = self.get_scene_summary()
        repr_str = "Fo3d scene with "
        for key, value in nodes_summary.items():
            if value > 0:
                key_pretty = key.replace("s", "") if value == 1 else key
                repr_str += f"{value} {key_pretty}, "
        return repr_str[:-2]

    def copy(self):
        """Returns a deep copy of the scene."""
        return Scene._from_fo3d_dict(self.as_dict())

    def write(self, path: str):
        """Export the scene to a .fo3d file."""
        if not path.endswith(".fo3d"):
            raise ValueError("Scene must be exported to a .fo3d file")

        scene_with_resolved_paths = self.copy()

        fo3d_path_dir = os.path.dirname(path)

        visited_nodes = set()
        for node in scene_with_resolved_paths.traverse():
            if node.name in visited_nodes:
                raise ValueError(
                    f"Scene contains multiple nodes with the same name: {node.name}"
                )

            visited_nodes.add(node.name)

            if hasattr(node, "pcd_path"):
                node.pcd_path = self._resolve_asset_path(
                    fo3d_path_dir, node.pcd_path
                )
            if hasattr(node, "obj_path"):
                node.obj_path = self._resolve_asset_path(
                    fo3d_path_dir, node.obj_path
                )
            if hasattr(node, "mtl_path"):
                node.mtl_path = self._resolve_asset_path(
                    fo3d_path_dir, node.mtl_path
                )
            if hasattr(node, "gltf_path"):
                node.gltf_path = self._resolve_asset_path(
                    fo3d_path_dir, node.gltf_path
                )
            if hasattr(node, "fbx_path"):
                node.fbx_path = self._resolve_asset_path(
                    fo3d_path_dir, node.fbx_path
                )
            if hasattr(node, "stl_path"):
                node.stl_path = self._resolve_asset_path(
                    fo3d_path_dir, node.stl_path
                )
            if hasattr(node, "ply_path"):
                node.ply_path = self._resolve_asset_path(
                    fo3d_path_dir, node.ply_path
                )

        with open(path, "w") as f:
            json.dump(scene_with_resolved_paths.as_dict(), f, indent=4)

    def _resolve_asset_path(self, root: str, path: str):
        if path is None:
            return None

        if not os.path.isabs(path):
            path = os.path.join(root, path)

        return path

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

    def traverse(self, include_self=False):
        """Traverse the scene graph.

        Usage:
        ```
        for node in scene.traverse():
            print(obj.name)
        ```
        """
        if include_self:
            yield self

        for child in self.children:
            yield from child.traverse(include_self=True)

    def get_scene_summary(self):
        """Returns a summary of the scene."""
        total_objs = 0
        total_point_clouds = 0
        total_gltfs = 0
        total_fbxs = 0
        total_stls = 0
        total_plys = 0

        for node in self.traverse():
            if isinstance(node, Pointcloud):
                total_point_clouds += 1
            elif isinstance(node, GLTFMesh):
                total_gltfs += 1
            elif isinstance(node, FBXMesh):
                total_fbxs += 1
            elif isinstance(node, StlMesh):
                total_stls += 1
            elif isinstance(node, PlyMesh):
                total_plys += 1
            elif isinstance(node, ObjMesh):
                total_objs += 1

        return {
            "objs": total_objs,
            "point clouds": total_point_clouds,
            "gltfs": total_gltfs,
            "fbxs": total_fbxs,
            "stls": total_stls,
            "plys": total_plys,
        }

    def get_asset_paths(self):
        """Collect all asset paths in the scene.
        Asset paths aren't resolved to absolute paths.
        """
        asset_paths = []

        for node in self.traverse():
            if isinstance(node, Pointcloud):
                asset_paths.append(node.pcd_path)
            elif isinstance(node, GLTFMesh):
                asset_paths.append(node.gltf_path)
            elif isinstance(node, FBXMesh):
                asset_paths.append(node.fbx_path)
            elif isinstance(node, StlMesh):
                asset_paths.append(node.stl_path)
            elif isinstance(node, PlyMesh):
                asset_paths.append(node.ply_path)
            elif isinstance(node, ObjMesh):
                asset_paths.append(node.obj_path)
                if node.mtl_path is not None:
                    asset_paths.append(node.mtl_path)

        return asset_paths

    @staticmethod
    def _from_fo3d_dict(dict_data: dict):
        scene: Scene = Scene._from_dict(convert_keys_to_snake_case(dict_data))

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

    @staticmethod
    def from_fo3d(path: str):
        """Load a scene from a .fo3d file."""
        if not path.endswith(".fo3d"):
            raise ValueError("Scene must be loaded from a .fo3d file")

        with open(path, "r") as f:
            dict_data = json.load(f)

        return Scene._from_fo3d_dict(dict_data)
