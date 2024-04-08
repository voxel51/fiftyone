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

import fiftyone.core.storage as fos

from .camera import PerspectiveCamera
from .lights import Light
from .mesh import FbxMesh, GltfMesh, ObjMesh, PlyMesh, StlMesh
from .object_3d import Object3D
from .pointcloud import Pointcloud
from .shape_3d import Shape3D
from .utils import FO3D_VERSION_KEY, convert_keys_to_snake_case

fo3d_path_attributes = [
    "pcd_path",
    "ply_path",
    "obj_path",
    "mtl_path",
    "fbx_path",
    "stl_path",
    "gltf_path",
]


@dataclass
class SceneBackground:
    """Represents the background of the scene.

    Args:
        color (str, optional): the background color of the scene
        image (str, optional): the path to the background image. Defaults to
            None. This takes precedence over color if provided
        cube (list, optional): the paths to the six faces of the background.
            The order of the faces is: +X, -X, +Y, -Y, +Z, -Z. Defaults to
            ``None``. This takes precedence over the image and color if
            provided. This can be used to build a skybox
        intensity (float, optional): the intensity of the background. Defaults
            to ``1.0``. This only applies for ``image`` and ``cube`` backgrounds
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
        camera (None): the default camera of the scene. If ``None``, a default
            :class:`fiftyone.core.threed.PerspectiveCamera` is created with
            reasonable defaults
        lights (None): a list of lights in the scene. If``None``, a default set
            of lights is used, which includes an ambient light and six
            directional lights placed at different angles around the scene
        background (None): the background for the scene. May be a color, image,
            or a skybox

    Usage::

            scene = Scene()

            obj_mesh = ObjMesh(
                "obj_mesh_name", "/path/to/obj", mtl_path="/path/to/mtl"
            )
            gltf_mesh = GltfMesh("gltf_mesh_name", "/path/to/gltf")
            pcd = Pointcloud("pcd_name", "/path/to/pcd")

            scene.add(obj_mesh)
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
        repr_str = "fo3d scene with "
        asset_detected = False
        for asset_name, asset_count in nodes_summary.items():
            if asset_count > 0:
                asset_detected = True
                key_pretty = (
                    asset_name[:-1]
                    if asset_name.endswith("s") and asset_count == 1
                    else asset_name
                )
                repr_str += f"{asset_count} {key_pretty}, "

        if asset_detected:
            return repr_str[:-2]
        else:
            return "Empty scene"

    def copy(self):
        """Returns a deep copy of the scene."""
        return Scene._from_fo3d_dict(self.as_dict())

    def write(self, fo3d_path: str, resolve_relative_paths=False):
        """Export the scene to a ``.fo3d`` file.

        Args:
            fo3d_path: the path to write the scene to
            resolve_relative_paths: whether to resolve relative paths in the
                scene to absolute paths. If ``True``, all asset paths in the
                scene are resolved to absolute paths. If ``False``, asset
                paths are left as-is. Defaults to ``False``.
        """
        if not fo3d_path.endswith(".fo3d"):
            raise ValueError("Scene must be exported to a .fo3d file")

        validated_scene = self.copy()

        fo3d_path_dir = os.path.dirname(fo3d_path)

        visited_nodes = set()
        for node in validated_scene.traverse():
            if node.name in visited_nodes:
                raise ValueError(
                    f"Scene contains multiple nodes with the same name: {node.name}"
                )

            visited_nodes.add(node.name)

            if resolve_relative_paths:
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

        fos.write_json(validated_scene.as_dict(), fo3d_path, pretty_print=True)

    def traverse(self, include_self=False):
        """Traverse the scene graph.

        Args:
            include_self: whether to include the current node in the traversal
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
        total_shapes = 0

        for node in self.traverse():
            if isinstance(node, Pointcloud):
                total_point_clouds += 1
            elif isinstance(node, GltfMesh):
                total_gltfs += 1
            elif isinstance(node, FbxMesh):
                total_fbxs += 1
            elif isinstance(node, StlMesh):
                total_stls += 1
            elif isinstance(node, PlyMesh):
                total_plys += 1
            elif isinstance(node, ObjMesh):
                total_objs += 1
            elif isinstance(node, Shape3D):
                total_shapes += 1

        return {
            "objs": total_objs,
            "point clouds": total_point_clouds,
            "gltfs": total_gltfs,
            "fbxs": total_fbxs,
            "stls": total_stls,
            "plys": total_plys,
            "shapes": total_shapes,
        }

    def get_asset_paths(self):
        """Collect all asset paths in the scene. Asset paths aren't resolved to
        absolute paths.
        """
        asset_paths = []

        for node in self.traverse():
            if isinstance(node, Pointcloud):
                asset_paths.append(node.pcd_path)
            elif isinstance(node, GltfMesh):
                asset_paths.append(node.gltf_path)
            elif isinstance(node, FbxMesh):
                asset_paths.append(node.fbx_path)
            elif isinstance(node, StlMesh):
                asset_paths.append(node.stl_path)
            elif isinstance(node, PlyMesh):
                asset_paths.append(node.ply_path)
            elif isinstance(node, ObjMesh):
                asset_paths.append(node.obj_path)
                if node.mtl_path is not None:
                    asset_paths.append(node.mtl_path)

        # append paths in scene background, if any
        if self.background is not None:
            if self.background.image is not None:
                asset_paths.append(self.background.image)
            if self.background.cube is not None:
                asset_paths.extend(self.background.cube)
        return asset_paths

    def _resolve_asset_path(self, root: str, path: str):
        if path is None:
            return None

        if not os.path.isabs(path):
            path = os.path.join(root, path)

        return path

    def _to_dict_extra(self):
        return {
            FO3D_VERSION_KEY: "1.0",
            "uuid": self.uuid,
            "camera": self.camera.as_dict(),
            "lights": (
                [light.as_dict() for light in self.lights]
                if self.lights
                else None
            ),
            "background": (
                self.background.as_dict() if self.background else None
            ),
        }

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
        """Load a scene from a ``.fo3d`` file."""
        if not path.endswith(".fo3d"):
            raise ValueError("Scene must be loaded from a .fo3d file")

        dict_data = fos.read_json(path)

        return Scene._from_fo3d_dict(dict_data)
