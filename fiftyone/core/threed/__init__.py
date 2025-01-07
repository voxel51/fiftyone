"""
3D definitions for FiftyOne.

| Copyright 2017-2025, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""

from .lights import AmbientLight, DirectionalLight, PointLight, SpotLight
from .material_3d import (
    MeshBasicMaterial,
    MeshDepthMaterial,
    MeshLambertMaterial,
    MeshStandardMaterial,
    MeshPhongMaterial,
    PointCloudMaterial,
)
from .mesh import FbxMesh, GltfMesh, ObjMesh, PlyMesh, StlMesh
from .object_3d import Object3D
from .pointcloud import *
from .scene_3d import *
from .shape_3d import (
    BoxGeometry,
    PlaneGeometry,
    SphereGeometry,
    CylinderGeometry,
)
from .transformation import Euler, Quaternion, Vector3

# This enables Sphinx refs to directly use paths imported here
__all__ = [k for k, v in globals().items() if not k.startswith("_")]
