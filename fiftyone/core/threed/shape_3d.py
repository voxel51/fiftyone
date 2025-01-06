"""
Mesh definitions for 3D visualization.

| Copyright 2017-2025, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""

import math
from typing import Optional

from .material_3d import MeshMaterial
from .mesh import Mesh
from .transformation import Quaternion, Vec3UnionType


class Shape3D(Mesh):
    """Represents an abstract 3D shape.

    Args:
        name: the name of the mesh
        material (:class:`fiftyone.core.threed.MeshMaterial`, optional):
            default material for the shape mesh. Defaults to
            :class:`fiftyone.core.threed.MeshStandardMaterial` if not provided
        visible (True): default visibility of the mesh in the scene
        position (None): the position of the mesh in object space
        quaternion (None): the quaternion of the mesh in object space
        scale (None): the scale of the mesh in object space
    """

    pass


class BoxGeometry(Shape3D):
    """Represents a 3D box.

    Args:
        name (str): name of the box
        width (float): the width of the box. Defaults to 1
        height (float): the height of the box. Defaults to 1
        depth (float): the depth of the box. Defaults to 1
        material (:class:`fiftyone.core.threed.MeshMaterial`, optional):
            default material for the box. Defaults to
            :class:`fiftyone.core.threed.MeshStandardMaterial`
        visible (True): default visibility of the mesh in the scene
        position (None): the position of the mesh in object space
        quaternion (None): the quaternion of the mesh in object space
        scale (None): the scale of the mesh in object space
    """

    def __init__(
        self,
        name: str,
        width: float = 1,
        height: float = 1,
        depth: float = 1,
        default_material: Optional[MeshMaterial] = None,
        visible=True,
        position: Optional[Vec3UnionType] = None,
        scale: Optional[Vec3UnionType] = None,
        quaternion: Optional[Quaternion] = None,
    ):
        super().__init__(
            name=name,
            material=default_material,
            visible=visible,
            position=position,
            scale=scale,
            quaternion=quaternion,
        )
        self.width = width
        self.height = height
        self.depth = depth

    def _to_dict_extra(self):
        return {
            **super()._to_dict_extra(),
            **{
                "width": self.width,
                "height": self.height,
                "depth": self.depth,
            },
        }


class CylinderGeometry(Shape3D):
    """Represents a 3D cylinder.

    Args:
        name (str): name of the cylinder
        radius_top (float): the radius of the top of the cylinder.
            Defaults to 1
        radius_bottom (float): the radius of the bottom of the cylinder.
            Defaults to 1
        height (float): the height of the cylinder. Defaults to 1
        radial_segments (int): number of segmented faces around the
            circumference of the cylinder. Defaults to 32
        height_segments (int): number of rows of faces around the
            circumference of the cylinder. Defaults to 1
        open_ended (bool): whether the cylinder is open-ended. Defaults to
            ``False``
        theta_start (float): the start angle for the vertical sweep. Defaults
            to 0
        theta_length (float): the angle for the vertical sweep. Defaults
            to 2*Math.PI, which makes for a complete cylinder
        material (:class:`fiftyone.core.threed.MeshMaterial`, optional):
            default material for the cylinder. Defaults to
            :class:`fiftyone.core.threed.MeshStandardMaterial`
        visible (True): default visibility of the mesh in the scene
        position (None): the position of the mesh in object space
        quaternion (None): the quaternion of the mesh in object space
        scale (None): the scale of the mesh in object space
    """

    def __init__(
        self,
        name: str,
        radius_top: float = 1,
        radius_bottom: float = 1,
        height: float = 1,
        radial_segments: int = 32,
        height_segments: int = 1,
        open_ended: bool = False,
        theta_start: float = 0,
        theta_length: float = 2 * math.pi,
        default_material: Optional[MeshMaterial] = None,
        visible=True,
        position: Optional[Vec3UnionType] = None,
        scale: Optional[Vec3UnionType] = None,
        quaternion: Optional[Quaternion] = None,
    ):
        super().__init__(
            name=name,
            material=default_material,
            visible=visible,
            position=position,
            scale=scale,
            quaternion=quaternion,
        )
        self.radius_top = radius_top
        self.radius_bottom = radius_bottom
        self.height = height
        self.radial_segments = radial_segments
        self.height_segments = height_segments
        self.open_ended = open_ended
        self.theta_start = theta_start
        self.theta_length = theta_length

    def _to_dict_extra(self):
        return {
            **super()._to_dict_extra(),
            **{
                "radiusTop": self.radius_top,
                "radiusBottom": self.radius_bottom,
                "height": self.height,
                "radialSegments": self.radial_segments,
                "heightSegments": self.height_segments,
                "openEnded": self.open_ended,
                "thetaStart": self.theta_start,
                "thetaLength": self.theta_length,
            },
        }


class SphereGeometry(Shape3D):
    """Represents a 3D sphere.

    Args:
        name (str): the name of the sphere
        radius (float): the radius of the sphere. Defaults to 1
        width_segments (int): the number of segmented faces around the
            circumference of the sphere. Defaults to 32
        height_segments (int): the number of rows of faces around the
            circumference of the sphere. Defaults to 16
        phi_start (float): the start angle for the horizontal sweep. Defaults
            to 0
        phi_length (float): the angle for the horizontal sweep. Defaults to
            ``2*math.pi``, which makes for a complete sphere
        theta_start (float): the start angle for the vertical sweep. Defaults
            to 0
        theta_length (float): the angle for the vertical sweep. Defaults to
            ``math.pi``, which makes for a complete sphere
        material (:class:`fiftyone.core.threed.MeshMaterial`, optional):
            the default material for the sphere. Defaults to
            :class:`fiftyone.core.threed.MeshStandardMaterial`
        visible (True): default visibility of the mesh in the scene
        position (None): the position of the mesh in object space
        quaternion (None): the quaternion of the mesh in object space
        scale (None): the scale of the mesh in object space
    """

    def __init__(
        self,
        name: str,
        radius: float = 1,
        width_segments: int = 32,
        height_segments: int = 16,
        phi_start: float = 0,
        phi_length: float = 2 * math.pi,
        theta_start: float = 0,
        theta_length: float = math.pi,
        default_material: Optional[MeshMaterial] = None,
        visible=True,
        position: Optional[Vec3UnionType] = None,
        scale: Optional[Vec3UnionType] = None,
        quaternion: Optional[Quaternion] = None,
    ):
        super().__init__(
            name=name,
            material=default_material,
            visible=visible,
            position=position,
            scale=scale,
            quaternion=quaternion,
        )
        self.radius = radius
        self.width_segments = width_segments
        self.height_segments = height_segments
        self.phi_start = phi_start
        self.phi_length = phi_length
        self.theta_start = theta_start
        self.theta_length = theta_length

    def _to_dict_extra(self):
        return {
            **super()._to_dict_extra(),
            **{
                "radius": self.radius,
                "widthSegments": self.width_segments,
                "heightSegments": self.height_segments,
                "phiStart": self.phi_start,
                "phiLength": self.phi_length,
                "thetaStart": self.theta_start,
                "thetaLength": self.theta_length,
            },
        }


class PlaneGeometry(Shape3D):
    """Represents a 3D plane.

    Args:
        name (str): name of the plane
        width (float): the width of the plane. Defaults to 1
        height (float): the height of the plane. Defaults to 1
        material (:class:`fiftyone.core.threed.MeshMaterial`, optional):
            the default material for the plane. Defaults to
            :class:`fiftyone.core.threed.MeshStandardMaterial`
        visible (True): default visibility of the mesh in the scene
        position (None): the position of the mesh in object space
        quaternion (None): the quaternion of the mesh in object space
        scale (None): the scale of the mesh in object space
    """

    def __init__(
        self,
        name: str,
        width: float = 1,
        height: float = 1,
        default_material: Optional[MeshMaterial] = None,
        visible=True,
        position: Optional[Vec3UnionType] = None,
        scale: Optional[Vec3UnionType] = None,
        quaternion: Optional[Quaternion] = None,
    ):
        super().__init__(
            name=name,
            material=default_material,
            visible=visible,
            position=position,
            scale=scale,
            quaternion=quaternion,
        )
        self.width = width
        self.height = height

    def _to_dict_extra(self):
        return {
            **super()._to_dict_extra(),
            **{
                "width": self.width,
                "height": self.height,
            },
        }
