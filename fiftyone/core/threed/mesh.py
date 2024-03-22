"""
| Copyright 2017-2024, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""
from .object_3d import Object3D


class Mesh(Object3D):
    pass


class ObjMesh(Mesh):
    def __init__(self, obj_url: str, mtl_url: str = None, *args, **kwargs):
        super().__init__(*args, **kwargs)

        if not obj_url.endswith(".obj"):
            raise ValueError("OBJ mesh must be a .obj file")

        self.obj_url = obj_url

        if mtl_url is not None and not mtl_url.endswith(".mtl"):
            raise ValueError("OBJ material must be a .mtl file")

        self.mtl_url = mtl_url


class GLTFMesh(Mesh):
    def __init__(self, gltf_url: str, *args, **kwargs):
        super().__init__(*args, **kwargs)

        if not gltf_url.endswith(".gltf"):
            raise ValueError("GLTF mesh must be a .gltf file")

        self.gltf_url = gltf_url


class PlyMesh(Mesh):
    def __init__(self, ply_url: str, *args, **kwargs):
        super().__init__(*args, **kwargs)

        if not ply_url.endswith(".ply"):
            raise ValueError("PLY mesh must be a .ply file")

        self.ply_url = ply_url


class StlMesh(Mesh):
    def __init__(self, stl_url: str, *args, **kwargs):
        super().__init__(*args, **kwargs)

        if not stl_url.endswith(".stl"):
            raise ValueError("STL mesh must be a .stl file")

        self.stl_url = stl_url
