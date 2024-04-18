"""
Pointcloud definition for 3D visualization.

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
        name (str): the name of the point cloud
        pcd_path (str): the path to the ``.pcd`` file. The path may be either
            absolute or relative to the directory containing the ``.fo3d`` file
        material (:class:`fiftyone.core.threed.PointcloudMaterial`, optional):
            the material of the point cloud. If not specified, defaults to a
            new instance of :class:`fiftyone.core.threed.PointcloudMaterial`
            with its default parameters
        flag_for_projection (bool): whether to flag the point cloud for
            usage in orthographic projection. Each
            :class:`fiftyone.core.threed.Scene` can have at most one asset
            flagged for orthographic projection. Defaults to ``False``. If
            multiple assets are flagged, the first one will be chosen
        **kwargs: keyword arguments for the
            :class:`fiftyone.core.threed.Object3D` parent class

    Raises:
        ValueError: if ``pcd_path`` does not end with ``.pcd``
    """

    def __init__(
        self,
        name: str,
        pcd_path: str,
        material: Optional[PointcloudMaterial] = None,
        flag_for_projection: bool = False,
        **kwargs
    ):
        super().__init__(name=name, **kwargs)

        if not pcd_path.lower().endswith(".pcd"):
            raise ValueError("Point cloud must be a .pcd file")

        self.pcd_path = pcd_path

        if isinstance(material, dict):
            material = PointcloudMaterial._from_dict(material)

        self.default_material = material or PointcloudMaterial()
        self.flag_for_projection = flag_for_projection

    def set_default_material(self, material: PointcloudMaterial):
        """Sets the material of the point cloud.

        Args:
            material (PointcloudMaterial): The material to set as the default
        """
        if isinstance(material, dict):
            material = PointcloudMaterial._from_dict(material)

        self.default_material = material

    def _to_dict_extra(self):
        """Extra properties to include in dictionary representation."""
        return {
            "pcdPath": self.pcd_path,
            "defaultMaterial": self.default_material.as_dict(),
            "flagForProjection": self.flag_for_projection,
        }
