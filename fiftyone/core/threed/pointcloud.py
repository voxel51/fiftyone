"""
PointCloud definition for 3D visualization.

| Copyright 2017-2025, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""

from typing import Optional

from .material_3d import PointCloudMaterial
from .object_3d import Object3D
from .transformation import Quaternion, Vec3UnionType


class PointCloud(Object3D):
    """Represents a point cloud.

    Args:
        name (str): the name of the point cloud
        pcd_path (str): the path to the ``.pcd`` file. The path may be either
            absolute or relative to the directory containing the ``.fo3d`` file
        material (:class:`fiftyone.core.threed.PointCloudMaterial`, optional):
            the material of the point cloud. If not specified, defaults to a
            new instance of :class:`fiftyone.core.threed.PointCloudMaterial`
            with its default parameters
        center_geometry (bool): whether to center the geometry of the point
            cloud. Defaults to ``False``
        flag_for_projection (bool): whether to flag the point cloud for
            usage in orthographic projection. Each
            :class:`fiftyone.core.threed.Scene` can have at most one asset
            flagged for orthographic projection. Defaults to ``False``. If
            multiple assets are flagged, the first one will be chosen
        visible (True): default visibility of the point cloud in the scene
        position (None): the position of the object in point cloud space
        quaternion (None): the quaternion of the point cloud in object space
        scale (None): the scale of the point cloud in object space

    Raises:
        ValueError: if ``pcd_path`` does not end with ``.pcd``
    """

    _asset_path_fields = ["pcd_path"]

    def __init__(
        self,
        name: str,
        pcd_path: str,
        material: Optional[PointCloudMaterial] = None,
        center_geometry: bool = False,
        flag_for_projection: bool = False,
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

        if not pcd_path.lower().endswith(".pcd"):
            raise ValueError("Point cloud must be a .pcd file")

        self.pcd_path = pcd_path

        if isinstance(material, dict):
            material = PointCloudMaterial._from_dict(material)

        self.center_geometry = center_geometry
        self.default_material = material or PointCloudMaterial()
        self.flag_for_projection = flag_for_projection

    def set_default_material(self, material: PointCloudMaterial):
        """Sets the material of the point cloud.

        Args:
            material (PointCloudMaterial): The material to set as the default
        """
        if isinstance(material, dict):
            material = PointCloudMaterial._from_dict(material)

        self.default_material = material

    def _to_dict_extra(self):
        """Extra properties to include in dictionary representation."""
        r = {
            "centerGeometry": self.center_geometry,
            "pcdPath": self.pcd_path,
            "defaultMaterial": self.default_material.as_dict(),
            "flagForProjection": self.flag_for_projection,
        }

        if hasattr(self, "_pre_transformed_pcd_path"):
            r["preTransformedPcdPath"] = self._pre_transformed_pcd_path

        return r
