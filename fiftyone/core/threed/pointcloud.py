"""
| Copyright 2017-2024, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""
from .object_3d import Object3D


class Pointcloud(Object3D):
    """Represents a point cloud."""

    def __init__(self, name: str, pcd_url: str, **kwargs):
        super().__init__(name=name, **kwargs)
        self.pcd_url = pcd_url

    def _to_dict_extra(self):
        return {"pcd_url": self.pcd_url}
