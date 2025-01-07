"""
3D scene definitions.

| Copyright 2017-2025, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""
import itertools
import os
from collections import Counter
from typing import List, Optional, Union


import fiftyone.core.storage as fos

from .camera import PerspectiveCamera
from .lights import Light
from .mesh import FbxMesh, GltfMesh, ObjMesh, PlyMesh, StlMesh
from .object_3d import Object3D
from .pointcloud import PointCloud
from .shape_3d import Shape3D
from .utils import FO3D_VERSION_KEY, convert_keys_to_snake_case
from .validators import BaseValidatedDataClass, validate_color, validate_list

fo3d_path_attributes = [
    "pcd_path",
    "ply_path",
    "obj_path",
    "mtl_path",
    "fbx_path",
    "stl_path",
    "gltf_path",
]


class SceneBackground(BaseValidatedDataClass):
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

    def __init__(
        self,
        color: Optional[str] = None,
        image: Optional[str] = None,
        cube: Optional[List[str]] = None,
        intensity: Optional[float] = 1.0,
    ):
        self.color = color
        self.image = image
        self.cube = cube
        self.intensity = intensity

    @property
    def color(self) -> Union[str, None]:
        return self._color

    @color.setter
    def color(self, value: Optional[str]) -> None:
        self._color = validate_color(value, nullable=True)

    @property
    def image(self) -> Union[str, None]:
        return self._image

    @image.setter
    def image(self, value: Optional[str]) -> None:
        self._image = None if value is None else str(value)

    @property
    def cube(self) -> Union[List[str], None]:
        return self._cube

    @cube.setter
    def cube(self, value: Optional[List[str]]) -> None:
        self._cube = validate_list(value, length=6, nullable=True)

    @property
    def intensity(self) -> Union[float, None]:
        return self._intensity

    @intensity.setter
    def intensity(self, value: Optional[float]) -> None:
        self._intensity = None if value is None else float(value)

    def as_dict(self) -> dict:
        return {
            "color": self.color,
            "image": self.image,
            "cube": self.cube,
            "intensity": self.intensity,
        }

    @staticmethod
    def _from_dict(d: dict):
        return SceneBackground(
            color=d.get("color"),
            image=d.get("image"),
            cube=d.get("cube"),
            intensity=d.get("intensity"),
        )


class Scene(Object3D):
    """Represents a scene graph which contains a hierarchy of 3D objects.

    Example usage::

        import fiftyone as fo

        scene = fo.Scene()

        obj_mesh = fo.ObjMesh(
            "obj_mesh_name", "/path/to/mesh.obj", mtl_path="/path/to/mesh.mtl"
        )
        gltf_mesh = fo.GltfMesh("gltf_mesh_name", "/path/to/mesh.gltf")
        pcd = fo.PointCloud("pcd_name", "/path/to/points.pcd")

        scene.add(obj_mesh)
        scene.add(gltf_mesh)
        scene.add(pcd)

        scene.write("/path/to/scene.fo3d")

        sample = fo.Sample("/path/to/scene.fo3d")

        dataset = fo.Dataset()
        dataset.add_sample(sample)

    Args:
        camera (None): the default camera of the scene. If ``None``, a default
            :class:`fiftyone.core.threed.PerspectiveCamera` is created with
            reasonable defaults
        lights (None): a list of lights in the scene. If``None``, a default set
            of lights is used, which includes an ambient light and six
            directional lights placed at different angles around the scene
        background (None): the background for the scene. May be a color, image,
            or a skybox
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

    def _resolve_node_asset_paths(self, node, fo3d_path_dir):
        for asset_path_field in node._asset_path_fields:
            asset_path = getattr(node, asset_path_field, None)
            if asset_path:
                resolved_asset_path = self._resolve_asset_path(
                    fo3d_path_dir, asset_path
                )
                setattr(node, asset_path_field, resolved_asset_path)

    def write(
        self, fo3d_path: str, resolve_relative_paths=False, pprint=False
    ):
        """Export the scene to a ``.fo3d`` file.

        Args:
            fo3d_path: the path to write the scene to
            resolve_relative_paths: whether to resolve relative paths in the
                scene to absolute paths. If ``True``, all asset paths in the
                scene are resolved to absolute paths. If ``False``, asset
                paths are left as-is. Defaults to ``False``.
            pprint: whether to pretty-print the JSON output. Defaults to
                ``False``.
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

            # Resolve child's asset paths
            if resolve_relative_paths:
                self._resolve_node_asset_paths(node, fo3d_path_dir)

        # Now resolve any asset paths in scene background
        if resolve_relative_paths and validated_scene.background is not None:
            if validated_scene.background.image is not None:
                validated_scene.background.image = self._resolve_asset_path(
                    fo3d_path_dir, validated_scene.background.image
                )
            if validated_scene.background.cube is not None:
                validated_scene.background.cube = [
                    self._resolve_asset_path(fo3d_path_dir, ci)
                    for ci in validated_scene.background.cube
                ]

        fos.write_json(
            validated_scene.as_dict(), fo3d_path, pretty_print=pprint
        )

    def traverse(self, include_self=False):
        """Traverse the scene graph.

        Args:
            include_self: whether to include the current node in the traversal

        Returns:
            a generator that yields :class:`Object3D` instances
        """
        if include_self:
            yield self

        for child in self.children:
            yield from child.traverse(include_self=True)

    def update_asset_paths(self, asset_rewrite_paths: dict):
        """Update asset paths in this scene according to an input dict mapping.

        Asset path is unchanged if it does not exist in ``asset_rewrite_paths``

        Args:
            asset_rewrite_paths: ``dict`` mapping asset path to new asset path

        Returns:
            ``True`` if the scene was modified.
        """
        scene_modified = False
        for node in self.traverse():
            for path_attribute in node._asset_path_fields:
                asset_path = getattr(node, path_attribute, None)
                new_asset_path = asset_rewrite_paths.get(asset_path)

                if new_asset_path is not None and asset_path != new_asset_path:
                    setattr(node, path_attribute, new_asset_path)
                    scene_modified = True

        # modify scene background paths, if any
        if self.background is not None:
            if self.background.image is not None:
                new_asset_path = asset_rewrite_paths.get(self.background.image)
                if (
                    new_asset_path is not None
                    and new_asset_path != self.background.image
                ):
                    self.background.image = new_asset_path
                    scene_modified = True

            if self.background.cube is not None:
                new_cube = [
                    asset_rewrite_paths.get(face, face)
                    for face in self.background.cube
                ]
                if new_cube != self.background.cube:
                    self.background.cube = new_cube
                    scene_modified = True

        return scene_modified

    def get_scene_summary(self):
        """Returns a summary of the scene."""
        node_types = Counter(map(type, self.traverse()))
        return {
            "objs": node_types[ObjMesh],
            "point clouds": node_types[PointCloud],
            "gltfs": node_types[GltfMesh],
            "fbxs": node_types[FbxMesh],
            "stls": node_types[StlMesh],
            "plys": node_types[PlyMesh],
            "shapes": node_types[Shape3D],
        }

    def get_asset_paths(self):
        """Returns a list of all asset paths in the scene.

        Note that any relative asset paths are not resolved to absolute paths.

        Returns:
            a list of asset paths
        """
        asset_paths = set(
            itertools.chain.from_iterable(
                node._get_asset_paths() for node in self.traverse()
            )
        )

        if self.background is not None:
            if self.background.image is not None:
                asset_paths.add(self.background.image)
            if self.background.cube is not None:
                asset_paths.update(self.background.cube)

        return list(asset_paths)

    def _resolve_asset_path(self, root: str, path: str):
        if path is None:
            return None

        if not fos.isabs(path):
            path = fos.abspath(fos.join(root, path))

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
        """Loads a scene from an FO3D file.

        Args:
            path: the path to an ``.fo3d`` file

        Returns:
            a :class:`Scene`
        """
        if not path.endswith(".fo3d"):
            raise ValueError("Scene must be loaded from a .fo3d file")

        dict_data = fos.read_json(path)

        return Scene._from_fo3d_dict(dict_data)
