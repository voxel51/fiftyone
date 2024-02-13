"""
| Copyright 2017-2024, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""

from typing import Optional

from .material_3d import PointcloudMaterial
from .object_3d import Object3D


class Pointcloud(Object3D):
    """Represents a point cloud.

    Args:
        name (str): Name of the point cloud.
        pcd_path (str): Path to the .pcd file.
        material (:class:`fiftyone.core.threed.PointcloudMaterial`, optional):
            Material of the point cloud. If not specified, defaults to a
            new instance of :class:`fiftyone.core.threed.PointcloudMaterial`
            with its default parameters.
        **kwargs: Arbitrary keyword arguments for base class.

    Raises:
        ValueError: If `pcd_path` does not end with '.pcd'.
    """

    def __init__(
        self,
        name: str,
        pcd_path: str,
        material: Optional[PointcloudMaterial] = None,
        **kwargs
    ):
        super().__init__(name=name, **kwargs)

        if not pcd_path.lower().endswith(".pcd"):
            raise ValueError("Point cloud must be a .pcd file")

        self.pcd_path = pcd_path
        self.default_material = (
            material if material is not None else PointcloudMaterial()
        )

    def set_default_material(self, material: PointcloudMaterial):
        """Sets the material of the point cloud.

        Args:
            material (PointcloudMaterial): The material to set as the default.
        """
        self.default_material = material

    def _to_dict_extra(self):
        """Extra properties to include in dictionary representation."""
        return {
            "pcd_path": self.pcd_path,
            "default_material": self.default_material.as_dict(),
        }
