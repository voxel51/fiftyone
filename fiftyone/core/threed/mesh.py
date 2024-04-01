"""
Mesh definitions for 3D visualization.

| Copyright 2017-2024, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""

from typing import Optional

from .material_3d import MeshMaterial, MeshStandardMaterial
from .object_3d import Object3D


class Mesh(Object3D):
    """Represents an abstract 3D mesh.

    Args:
        material (:class:`fiftyone.core.threed.MeshMaterial`, optional):
            the default material for the mesh. Defaults to
            :class:`fiftyone.core.threed.MeshLambertMaterial`
            if not provided
        **kwargs: keyword arguments for the
            :class:`fiftyone.core.threed.Object3D` parent class
    """

    def __init__(self, material: Optional[MeshMaterial] = None, **kwargs):
        super().__init__(**kwargs)

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
            :class:`fiftyone.core.threed.MeshLambertMaterial`
        **kwargs: keyword arguments for the :class:`Mesh` parent class

    Raises:
        ValueError: if ``obj_path`` does not end with ``.obj``
        ValueError: if ``mtl_path`` does not end with ``.mtl``
    """

    def __init__(
        self,
        name: str,
        obj_path: str,
        mtl_path: Optional[str] = None,
        default_material: Optional[MeshMaterial] = None,
        **kwargs
    ):
        super().__init__(name=name, material=default_material, **kwargs)

        if not obj_path.lower().endswith(".obj"):
            raise ValueError("OBJ mesh must be a .obj file")

        self.obj_path = obj_path

        if mtl_path is not None and not mtl_path.endswith(".mtl"):
            raise ValueError("OBJ material must be a .mtl file")

        self.mtl_path = mtl_path

    def _to_dict_extra(self):
        return {
            **super()._to_dict_extra(),
            **{
                "objPath": self.obj_path,
                "mtlPath": self.mtl_path,
            },
        }


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
        **kwargs: keyword arguments for the :class:`Mesh` parent class

    Raises:
        ValueError: If ``fbx_path`` does not end with ``.fbx``
    """

    def __init__(
        self,
        name: str,
        fbx_path: str,
        default_material: Optional[MeshMaterial] = None,
        **kwargs
    ):
        super().__init__(name=name, material=default_material, **kwargs)

        if not (fbx_path.lower().endswith(".fbx")):
            raise ValueError("FBX mesh must be a .fbx file")

        self.gltf_path = fbx_path

    def _to_dict_extra(self):
        return {**super()._to_dict_extra(), **{"fbxPath": self.gltf_path}}


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
            :class:`fiftyone.core.threed.MeshLambertMaterial`
        **kwargs: keyword arguments for the :class:`Mesh` parent class

    Raises:
        ValueError: if ``gltf_path`` does not end with '.gltf' or ``.glb``
    """

    def __init__(
        self,
        name: str,
        gltf_path: str,
        default_material: Optional[MeshMaterial] = None,
        **kwargs
    ):
        super().__init__(name=name, material=default_material, **kwargs)

        if not (
            gltf_path.lower().endswith(".gltf")
            or gltf_path.lower().endswith(".glb")
        ):
            raise ValueError("gLTF mesh must be a .gltf or .glb file")

        self.gltf_path = gltf_path

    def _to_dict_extra(self):
        return {**super()._to_dict_extra(), **{"gltfPath": self.gltf_path}}


class PlyMesh(Mesh):
    """
    Represents a PLY mesh. A PLY mesh can be a point cloud or a mesh.

    Args:
        name (str): the name of the mesh
        ply_path (str): the path to the ``.ply`` file. The path may be either
            absolute or relative to the directory containing the ``.fo3d`` file
        is_point_cloud (bool): whether the PLY file is a point cloud. Defaults
            to ``False``
        material (:class:`fiftyone.core.threed.MeshMaterial`, optional):
            default material for the mesh if PLY file does not contain
            vertex colors. Defaults to
            :class:`fiftyone.core.threed.MeshLambertMaterial`
        **kwargs: keyword arguments for the :class:`Mesh` parent class

    Raises:
        ValueError: if ``ply_path`` does not end with ``.ply``
    """

    def __init__(
        self,
        name: str,
        ply_path: str,
        is_point_cloud: bool = False,
        default_material: Optional[MeshMaterial] = None,
        **kwargs
    ):
        super().__init__(name=name, material=default_material, **kwargs)

        if not ply_path.lower().endswith(".ply"):
            raise ValueError("PLY mesh must be a .ply file")

        self.ply_path = ply_path
        self.is_point_cloud = is_point_cloud

    def _to_dict_extra(self):
        return {**super()._to_dict_extra(), **{"plyPath": self.ply_path}}


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
            :class:`fiftyone.core.threed.MeshLambertMaterial`
        **kwargs: keyword arguments for the :class:`Mesh` parent class

    Raises:
        ValueError: if ``stl_path`` does not end with ``.stl``
    """

    def __init__(
        self,
        name: str,
        stl_path: str,
        default_material: Optional[MeshMaterial] = None,
        **kwargs
    ):
        super().__init__(name=name, material=default_material, **kwargs)

        if not stl_path.lower().endswith(".stl"):
            raise ValueError("STL mesh must be a .stl file")

        self.stl_path = stl_path

    def _to_dict_extra(self):
        return {**super()._to_dict_extra(), **{"stlPath": self.stl_path}}
