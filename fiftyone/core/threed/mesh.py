"""
| Copyright 2017-2024, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""

from typing import Optional

from .material_3d import MeshLambertMaterial, MeshMaterial
from .object_3d import Object3D


class Mesh(Object3D):
    """Represents an abstract 3D mesh.

    Args:
        material (:class:`fiftyone.core.threed.MeshMaterial`, optional):
            Default material for the mesh. Defaults to
            :class:`fiftyone.core.threed.MeshLambertMaterial`
            if not provided.
        **kwargs: Arbitrary keyword arguments for
            :class:`fiftyone.core.threed.Object3D`base class.
    """

    def __init__(self, material: Optional[MeshMaterial] = None, **kwargs):
        super().__init__(**kwargs)

        if isinstance(material, dict):
            material = MeshMaterial._from_dict(material)

        self.default_material = material or MeshLambertMaterial()

    def set_default_material(self, material: MeshMaterial):
        """Sets the material of the mesh.

        Args:
            material (MeshMaterial): The material to set as the default.
        """
        self.default_material = material

    def _to_dict_extra(self):
        return {"defaultMaterial": self.default_material.as_dict()}


class ObjMesh(Mesh):
    """Represents an OBJ mesh.

    Args:
        name (str): Name of the mesh.
        obj_path (str): Path to the .obj file.
        mtl_path (str, optional): Path to the .mtl file. Defaults to None.
        material (:class:`fiftyone.core.threed.MeshMaterial`, optional):
            Default material for the mesh if `mtl_path` is not provided
            or if material in `mtl_path` is not found. Defaults to
            :class:`fiftyone.core.threed.MeshLambertMaterial`.
        **kwargs: Arbitrary keyword arguments for
            :class:`fiftyone.core.threed.Object3D` base class.

    Raises:
        ValueError: If `obj_path` does not end with '.obj'.
        ValueError: If `mtl_path` does not end with '.mtl'.
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
        return super()._to_dict_extra() | {
            "objPath": self.obj_path,
            "mtlPath": self.mtl_path,
        }


class FBXMesh(Mesh):
    """Represents an FBX mesh.

    Args:
        name (str): Name of the mesh.
        fbx_path (str): Path to the .fbx file.
        material (:class:`fiftyone.core.threed.MeshMaterial`, optional):
            Default material for the mesh if fbx file does not contain
            material information. Defaults to
            :class:`fiftyone.core.threed.MeshLambertMaterial`.
        **kwargs: Arbitrary keyword arguments for
            :class:`fiftyone.core.threed.Object3D` base class.

    Raises:
        ValueError: If `fbx_path` does not end with '.fbx'.
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
        return super()._to_dict_extra() | {"fbxPath": self.gltf_path}


class GLTFMesh(Mesh):
    """
    Represents a gLTF mesh.

    Args:
        name (str): Name of the mesh.
        gltf_path (str): Path to the .gltf or .glb file.
        material (:class:`fiftyone.core.threed.MeshMaterial`, optional):
            Default material for the mesh if gLTF file does not contain
            material information. Defaults to
            :class:`fiftyone.core.threed.MeshLambertMaterial`.
        **kwargs: Arbitrary keyword arguments for
            :class:`fiftyone.core.threed.Object3D` base class.

    Raises:
        ValueError: If `gltf_path` does not end with '.gltf' or '.glb'.
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
        return super()._to_dict_extra() | {"gltfPath": self.gltf_path}


class PlyMesh(Mesh):
    """
    Represents a PLY mesh. A PLY mesh can be a point cloud or a mesh.

    Args:
        name (str): Name of the mesh.
        ply_path (str): Path to the .ply file.
        is_point_cloud (bool): Whether the PLY file is a point cloud. Defaults
            to `False`.
        material (:class:`fiftyone.core.threed.MeshMaterial`, optional):
            Default material for the mesh if PLY file does not contain
            vertex colors. Defaults to
            :class:`fiftyone.core.threed.MeshLambertMaterial`.
        **kwargs: Arbitrary keyword arguments for
            :class:`fiftyone.core.threed.Object3D` base class.

    Raises:
        ValueError: If `ply_path` does not end with '.ply'.
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
        return super()._to_dict_extra() | {"plyPath": self.ply_path}


class StlMesh(Mesh):
    """
    Represents an STL mesh.

    Args:
        name (str): Name of the mesh.
        stl_path (str): Path to the .stl file.
        material (:class:`fiftyone.core.threed.MeshMaterial`, optional):
            Default material for the mesh. Defaults to
            :class:`fiftyone.core.threed.MeshLambertMaterial`.
        **kwargs: Arbitrary keyword arguments for
            :class:`fiftyone.core.threed.Object3D` base class.

    Raises:
        ValueError: If `stl_path` does not end with '.stl'.
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
        return super()._to_dict_extra() | {"stlPath": self.stl_path}
