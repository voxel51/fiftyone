"""
Mesh definitions for 3D visualization.

| Copyright 2017-2025, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""

from typing import Optional

from .material_3d import MeshMaterial, MeshStandardMaterial
from .object_3d import Object3D
from .transformation import Quaternion, Vec3UnionType


class Mesh(Object3D):
    """Represents an abstract 3D mesh.

    Args:
        name: the name of the mesh
        material (:class:`fiftyone.core.threed.MeshMaterial`, optional):
            the default material for the mesh. Defaults to
            :class:`fiftyone.core.threed.MeshStandardMaterial`
            if not provided
        visible (True): default visibility of the mesh in the scene
        position (None): the position of the mesh in object space
        quaternion (None): the quaternion of the mesh in object space
        scale (None): the scale of the mesh in object space
    """

    def __init__(
        self,
        name: str,
        material: Optional[MeshMaterial] = None,
        visible=True,
        position: Optional[Vec3UnionType] = None,
        scale: Optional[Vec3UnionType] = None,
        quaternion: Optional[Quaternion] = None,
    ):
        super().__init__(
            name=name,
            visible=visible,
            position=position,
            scale=scale,
            quaternion=quaternion,
        )

        if isinstance(material, dict):
            material = MeshMaterial._from_dict(material)

        self.default_material = material or MeshStandardMaterial()

    def set_default_material(self, material: MeshMaterial):
        """Sets the material of the mesh.

        Args:
            material (MeshMaterial): the material to set as the default
        """
        if isinstance(material, dict):
            material = MeshMaterial._from_dict(material)

        self.default_material = material

    def _to_dict_extra(self):
        return {"defaultMaterial": self.default_material.as_dict()}


class ObjMesh(Mesh):
    """Represents an OBJ mesh.

    Args:
        name (str): the name of the mesh
        obj_path (str): the path to the ``.obj`` file. The path may be either
            absolute or relative to the directory containing the ``.fo3d``
            file
        mtl_path (str, optional): the path to the ``.mtl`` file. Defaults to
            ``None``. The path may be either absolute or relative to the
            directory containing the ``.fo3d`` file
        material (:class:`fiftyone.core.threed.MeshMaterial`, optional):
            the default material for the mesh if ``mtl_path`` is not provided
            or if material in ``mtl_path`` is not found. Defaults to
            :class:`fiftyone.core.threed.MeshStandardMaterial`
        visible (True): default visibility of the mesh in the scene
        position (None): the position of the mesh in object space
        quaternion (None): the quaternion of the mesh in object space
        scale (None): the scale of the mesh in object space

    Raises:
        ValueError: if ``obj_path`` does not end with ``.obj``
        ValueError: if ``mtl_path`` does not end with ``.mtl``
    """

    _asset_path_fields = ["obj_path", "mtl_path"]

    def __init__(
        self,
        name: str,
        obj_path: str,
        mtl_path: Optional[str] = None,
        default_material: Optional[MeshMaterial] = None,
        visible=True,
        position: Optional[Vec3UnionType] = None,
        scale: Optional[Vec3UnionType] = None,
        quaternion: Optional[Quaternion] = None,
    ):
        super().__init__(
            name=name,
            material=default_material,
            visible=visible,
            position=position,
            scale=scale,
            quaternion=quaternion,
        )

        if not obj_path.lower().endswith(".obj"):
            raise ValueError("OBJ mesh must be a .obj file")

        self.obj_path = obj_path

        if mtl_path is not None and not mtl_path.endswith(".mtl"):
            raise ValueError("OBJ material must be a .mtl file")

        self.mtl_path = mtl_path

    def _to_dict_extra(self):
        r = {
            **super()._to_dict_extra(),
            **{
                "objPath": self.obj_path,
                "mtlPath": self.mtl_path,
            },
        }

        if hasattr(self, "_pre_transformed_obj_path"):
            r["preTransformedObjPath"] = self._pre_transformed_obj_path

        if hasattr(self, "_pre_transformed_mtl_path"):
            r["preTransformedMtlPath"] = self._pre_transformed_mtl_path

        return r


class FbxMesh(Mesh):
    """Represents an FBX mesh.

    Args:
        name (str): the name of the mesh
        fbx_path (str): the path to the ``.fbx`` file. Path may be either
            absolute or relative to the directory containing the ``.fo3d``
            file
        material (:class:`fiftyone.core.threed.MeshMaterial`, optional):
            the default material for the mesh if FBX file does not contain
            material information. Defaults to
            :class:`fiftyone.core.threed.MeshStandardMaterial`
        visible (True): default visibility of the mesh in the scene
        position (None): the position of the mesh in object space
        quaternion (None): the quaternion of the mesh in object space
        scale (None): the scale of the mesh in object space

    Raises:
        ValueError: If ``fbx_path`` does not end with ``.fbx``
    """

    _asset_path_fields = ["fbx_path"]

    def __init__(
        self,
        name: str,
        fbx_path: str,
        default_material: Optional[MeshMaterial] = None,
        visible=True,
        position: Optional[Vec3UnionType] = None,
        scale: Optional[Vec3UnionType] = None,
        quaternion: Optional[Quaternion] = None,
    ):
        super().__init__(
            name=name,
            material=default_material,
            visible=visible,
            position=position,
            scale=scale,
            quaternion=quaternion,
        )

        if not (fbx_path.lower().endswith(".fbx")):
            raise ValueError("FBX mesh must be a .fbx file")

        self.fbx_path = fbx_path

    def _to_dict_extra(self):
        r = {
            **super()._to_dict_extra(),
            **{"fbxPath": self.fbx_path},
        }

        if hasattr(self, "_pre_transformed_fbx_path"):
            r["preTransformedFbxPath"] = self._pre_transformed_fbx_path

        return r


class GltfMesh(Mesh):
    """
    Represents a gLTF mesh.

    Args:
        name (str): the name of the mesh
        gltf_path (str): the path to the ``.gltf`` or ``.glb`` file. The path
            may be either absolute or relative to the directory containing the
            ``.fo3d`` file
        material (:class:`fiftyone.core.threed.MeshMaterial`, optional):
            the default material for the mesh if gLTF file does not contain
            material information. Defaults to
            :class:`fiftyone.core.threed.MeshStandardMaterial`
        visible (True): default visibility of the mesh in the scene
        position (None): the position of the mesh in object space
        quaternion (None): the quaternion of the mesh in object space
        scale (None): the scale of the mesh in object space

    Raises:
        ValueError: if ``gltf_path`` does not end with '.gltf' or ``.glb``
    """

    _asset_path_fields = ["gltf_path"]

    def __init__(
        self,
        name: str,
        gltf_path: str,
        default_material: Optional[MeshMaterial] = None,
        visible=True,
        position: Optional[Vec3UnionType] = None,
        scale: Optional[Vec3UnionType] = None,
        quaternion: Optional[Quaternion] = None,
    ):
        super().__init__(
            name=name,
            material=default_material,
            visible=visible,
            position=position,
            scale=scale,
            quaternion=quaternion,
        )

        if not (
            gltf_path.lower().endswith(".gltf")
            or gltf_path.lower().endswith(".glb")
        ):
            raise ValueError("gLTF mesh must be a .gltf or .glb file")

        self.gltf_path = gltf_path

    def _to_dict_extra(self):
        r = {**super()._to_dict_extra(), **{"gltfPath": self.gltf_path}}

        if hasattr(self, "_pre_transformed_gltf_path"):
            r["preTransformedGltfPath"] = self._pre_transformed_gltf_path

        return r


class PlyMesh(Mesh):
    """
    Represents a PLY mesh. A PLY mesh can be a point cloud or a mesh.

    Args:
        name (str): the name of the mesh
        ply_path (str): the path to the ``.ply`` file. The path may be either
            absolute or relative to the directory containing the ``.fo3d`` file
        is_point_cloud (bool): whether the PLY file is a point cloud. Defaults
            to ``False``
        center_geometry (bool): whether to center the geometry. Defaults to
            ``True``
        material (:class:`fiftyone.core.threed.MeshMaterial`, optional):
            default material for the mesh if PLY file does not contain
            vertex colors. Defaults to
            :class:`fiftyone.core.threed.MeshStandardMaterial`. If the PLY
            file contains vertex colors, the material is ignored and vertex
            colors are used
        visible (True): default visibility of the mesh in the scene
        position (None): the position of the mesh in object space
        quaternion (None): the quaternion of the mesh in object space
        scale (None): the scale of the mesh in object space

    Raises:
        ValueError: if ``ply_path`` does not end with ``.ply``
    """

    _asset_path_fields = ["ply_path"]

    def __init__(
        self,
        name: str,
        ply_path: str,
        is_point_cloud: bool = False,
        center_geometry: bool = True,
        default_material: Optional[MeshMaterial] = None,
        visible=True,
        position: Optional[Vec3UnionType] = None,
        scale: Optional[Vec3UnionType] = None,
        quaternion: Optional[Quaternion] = None,
    ):
        super().__init__(
            name=name,
            material=default_material,
            visible=visible,
            position=position,
            scale=scale,
            quaternion=quaternion,
        )

        if not ply_path.lower().endswith(".ply"):
            raise ValueError("PLY mesh must be a .ply file")

        self.center_geometry = center_geometry
        self.ply_path = ply_path
        self.is_point_cloud = is_point_cloud

    def _to_dict_extra(self):
        r = {
            **super()._to_dict_extra(),
            **{
                "centerGeometry": self.center_geometry,
                "plyPath": self.ply_path,
                "isPointCloud": self.is_point_cloud,
            },
        }

        if hasattr(self, "_pre_transformed_ply_path"):
            r["preTransformedPlyPath"] = self._pre_transformed_ply_path

        return r


class StlMesh(Mesh):
    """
    Represents an STL mesh.

    Args:
        name (str): the name of the mesh
        stl_path (str): the path to the ``.stl`` file. The path may be either
            absolute or relative to the directory containing the ``.fo3d``
            file
        material (:class:`fiftyone.core.threed.MeshMaterial`, optional):
            default material for the mesh. Defaults to
            :class:`fiftyone.core.threed.MeshStandardMaterial`
        visible (True): default visibility of the mesh in the scene
        position (None): the position of the mesh in object space
        quaternion (None): the quaternion of the mesh in object space
        scale (None): the scale of the mesh in object space

    Raises:
        ValueError: if ``stl_path`` does not end with ``.stl``
    """

    _asset_path_fields = ["stl_path"]

    def __init__(
        self,
        name: str,
        stl_path: str,
        default_material: Optional[MeshMaterial] = None,
        visible=True,
        position: Optional[Vec3UnionType] = None,
        scale: Optional[Vec3UnionType] = None,
        quaternion: Optional[Quaternion] = None,
    ):
        super().__init__(
            name=name,
            material=default_material,
            visible=visible,
            position=position,
            scale=scale,
            quaternion=quaternion,
        )

        if not stl_path.lower().endswith(".stl"):
            raise ValueError("STL mesh must be a .stl file")

        self.stl_path = stl_path

    def _to_dict_extra(self):
        r = {**super()._to_dict_extra(), **{"stlPath": self.stl_path}}

        if hasattr(self, "_pre_transformed_stl_path"):
            r["preTransformedStlPath"] = self._pre_transformed_stl_path

        return r
