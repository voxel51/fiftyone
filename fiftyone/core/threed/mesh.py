"""
| Copyright 2017-2024, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""
from .object_3d import Object3D


class Mesh(Object3D):
    pass


class ObjMesh(Mesh):
    def __init__(
        self, name: str, obj_path: str, mtl_path: str = None, **kwargs
    ):
        super().__init__(name=name, **kwargs)

        if not obj_path.endswith(".obj"):
            raise ValueError("OBJ mesh must be a .obj file")

        self.obj_path = obj_path

        if mtl_path is not None and not mtl_path.endswith(".mtl"):
            raise ValueError("OBJ material must be a .mtl file")

        self.mtl_path = mtl_path

    def _to_dict_extra(self):
        return {
            "obj_path": self.obj_path,
            "mtl_path": self.mtl_path,
        }


class GLTFMesh(Mesh):
    def __init__(self, name: str, gltf_path: str, **kwargs):
        super().__init__(name=name, **kwargs)

        if not gltf_path.endswith(".gltf"):
            raise ValueError("GLTF mesh must be a .gltf file")

        self.gltf_path = gltf_path

    def _to_dict_extra(self):
        return {"gltf_path": self.gltf_path}


class PlyMesh(Mesh):
    def __init__(self, name: str, ply_path: str, **kwargs):
        super().__init__(name=name, **kwargs)

        if not ply_path.endswith(".ply"):
            raise ValueError("PLY mesh must be a .ply file")

        self.ply_path = ply_path

    def _to_dict_extra(self):
        return {"ply_path": self.ply_path}


class StlMesh(Mesh):
    def __init__(self, name: str, stl_path: str, **kwargs):
        super().__init__(name=name, **kwargs)

        if not stl_path.endswith(".stl"):
            raise ValueError("STL mesh must be a .stl file")

        self.stl_path = stl_path

    def _to_dict_extra(self):
        return {"stl_path": self.stl_path}
