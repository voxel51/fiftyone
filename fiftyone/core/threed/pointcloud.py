"""
| Copyright 2017-2024, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""

from .object_3d import Object3D
from .material_3d import PointcloudMaterial


class Pointcloud(Object3D):
    """Represents a point cloud."""

    def __init__(
        self,
        name: str,
        pcd_path: str,
        default_material: PointcloudMaterial = None,
        **kwargs
    ):
        super().__init__(name=name, **kwargs)
        self.pcd_path = pcd_path
        self.default_material = default_material or PointcloudMaterial()

    def set_default_material(self, material: PointcloudMaterial):
        """Sets the material of the point cloud."""
        self.default_material = material

    def _to_dict_extra(self):
        return {"pcd_path": self.pcd_path}
