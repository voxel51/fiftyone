"""
Fiftyone 3D Scene.

| Copyright 2017-2024, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""
import json

from .object_3d import Object3D


class Scene(Object3D):
    """Represents the scene graph and contains a hierarchy of Object3Ds.

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

    def export(self, path: str):
        """Export the scene to a .fo3d file."""
        if not path.endswith(".fo3d"):
            raise ValueError("Scene must be exported to a .fo3d file")

        scene = super()._to_dict()

        with open(path, "w") as f:
            json.dump(scene, f)

    @staticmethod
    def from_fo3d(path: str):
        """Load a scene from a .fo3d file."""
        if not path.endswith(".fo3d"):
            raise ValueError("Scene must be loaded from a .fo3d file")

        with open(path, "r") as f:
            dict_data = json.load(f)

        return Scene._from_dict(dict_data)
