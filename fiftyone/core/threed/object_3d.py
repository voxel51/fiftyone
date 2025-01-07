"""
FiftyOne 3D Object3D base class.

| Copyright 2017-2025, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""
import uuid
from typing import List, Optional, Tuple, Union

import numpy as np
from scipy.spatial.transform import Rotation

import fiftyone.core.utils as fou

from .transformation import (
    Euler,
    Quaternion,
    Vec3UnionType,
    Vector3,
    coerce_to_vec3,
    normalize_to_vec3,
)
from .utils import FO3D_VERSION_KEY

threed = fou.lazy_import("fiftyone.core.threed")


class Object3D(object):
    """The base class for all 3D objects in the scene.

    Args:
        name: the name of the object
        visible (True): default visibility of the object in the scene
        position (None): the position of the object in object space
        quaternion (None): the quaternion of the object in object space
        scale (None): the scale of the object in object space
    """

    _asset_path_fields = []

    def __init__(
        self,
        name: str,
        visible=True,
        position: Optional[Vec3UnionType] = None,
        scale: Optional[Vec3UnionType] = None,
        quaternion: Optional[Quaternion] = None,
    ):
        self.name = name
        self.visible = visible

        self._position = normalize_to_vec3(position) if position else Vector3()
        self._scale = (
            coerce_to_vec3(scale) if scale else Vector3(1.0, 1.0, 1.0)
        )
        self._quaternion = quaternion or Quaternion()

        self._rotation = Euler()

        self._local_transform_matrix = np.eye(4)
        self._uuid = str(uuid.uuid4())

        if position or quaternion or scale:
            self._update_matrix()

        self.children = []

    def __repr__(self):
        return f'{self.__class__.__name__}(name="{self.name}", visible={self.visible})'

    def __str__(self):
        return self.__repr__()

    def __eq__(self, other):
        return np.array_equal(
            self.local_transform_matrix, other.local_transform_matrix
        )

    def __iter__(self):
        return iter(self.children)

    @property
    def uuid(self):
        """The unique ID of the object."""
        return self._uuid

    @property
    def position(self):
        """The position of the object in object space."""
        return self._position

    @position.setter
    def position(self, value: Vec3UnionType):
        self._position = normalize_to_vec3(value)
        self._update_matrix()

    @property
    def rotation(self):
        """The rotation of the object in object space."""
        return self._rotation

    @rotation.setter
    def rotation(self, value: Union[Euler, List[float], Tuple[float, ...]]):
        if isinstance(value, (list, tuple)) and len(value) == 3:
            value = Euler(*value)
        elif not isinstance(value, Euler):
            raise ValueError(
                "rotation must be a Euler or a list/tuple of length 3"
            )
        self._rotation = value
        self._quaternion = value.to_quaternion()
        self._update_matrix()

    @property
    def quaternion(self):
        """The quaternion of the object in object space."""
        return self._quaternion

    @quaternion.setter
    def quaternion(
        self, value: Union[Quaternion, List[float], Tuple[float, ...]]
    ):
        if isinstance(value, (list, tuple)) and len(value) == 4:
            value = Quaternion(*value)
        elif not isinstance(value, Quaternion):
            raise ValueError(
                "quaternion must be a Quaternion or a list/tuple of length 4"
            )
        self._quaternion = value
        self._rotation = value.to_euler()
        self._update_matrix()

    @property
    def scale(self):
        """The scale of the object in object space."""
        return self._scale

    @scale.setter
    def scale(self, value: Vec3UnionType):
        self._scale = coerce_to_vec3(value)
        self._update_matrix()

    @property
    def local_transform_matrix(self):
        """The local transform matrix of the object.

        Setting this property also decomposes the matrix into
        its constituent position, quaternion, and scale components.
        However, decomposition of matrices with skew / shear components
        (non-uniform scaling) might have unexpected results.
        """
        return self._local_transform_matrix

    @local_transform_matrix.setter
    def local_transform_matrix(self, value: np.ndarray):
        if isinstance(value, np.ndarray) and value.shape == (4, 4):
            self._local_transform_matrix = value
        else:
            raise ValueError(
                "local_transform_matrix must be a 4x4 numpy array"
            )

        # decompose and set position, quaternion, and scale
        # extract position
        self._position = Vector3(*value[:3, 3])

        # extract scale
        self._scale = Vector3(
            np.linalg.norm(value[0, :3]),
            np.linalg.norm(value[1, :3]),
            np.linalg.norm(value[2, :3]),
        )

        # extract rotation
        norm_matrix = value[:3, :3] / self._scale.to_arr()

        r = Rotation.from_matrix(norm_matrix)
        self._quaternion = Quaternion(*r.as_quat())
        self._rotation = Euler(*r.as_euler("XYZ", degrees=False))

    def _update_matrix(self):
        rotation_matrix = Rotation.from_quat(
            [
                self._quaternion.x,
                self._quaternion.y,
                self._quaternion.z,
                self._quaternion.w,
            ]
        ).as_matrix()

        # extend the rotation matrix to 4x4 by adding a row and column for homogeneous coordinates
        rotation_matrix_4x4 = np.eye(4)
        rotation_matrix_4x4[:3, :3] = rotation_matrix

        # translation matrix
        trans_matrix = np.array(
            [
                [1, 0, 0, self._position.x],
                [0, 1, 0, self._position.y],
                [0, 0, 1, self._position.z],
                [0, 0, 0, 1],
            ]
        )

        # scale matrix
        scale_matrix = np.diag(
            [self._scale.x, self._scale.y, self._scale.z, 1]
        )

        self._local_transform_matrix = (
            trans_matrix @ rotation_matrix_4x4 @ scale_matrix
        )

    def add(self, *objs: "Object3D") -> None:
        """Add one or more objects as children of this one."""
        if any(o is self for o in objs):
            raise ValueError("Loop detected; can't add self as a child")

        self.children.extend(objs)

    def clear(self) -> None:
        """Remove all children from this object."""
        self.children = []

    def _get_asset_paths(self) -> List[str]:
        """Get asset paths for this node"""
        return [
            getattr(self, f, None)
            for f in self._asset_path_fields
            if getattr(self, f, None) is not None
        ]

    def traverse(self, include_self=True):
        """Traverse the scene graph."""
        if include_self:
            yield self

        for child in self.children:
            yield from child.traverse(include_self=True)

    def as_dict(self):
        """Converts the object to a dict."""
        data = {
            "_type": self.__class__.__name__,
            "uuid": self.uuid,
            "name": self.name,
            "visible": self.visible,
            "position": self.position.to_arr().tolist(),
            "quaternion": self.quaternion.to_arr().tolist(),
            "scale": self.scale.to_arr().tolist(),
            "children": [child.as_dict() for child in self.children],
        }

        # add object-specific data
        data.update(self._to_dict_extra())

        return data

    def _to_dict_extra(self):
        """Returns the extra data to include in the dict representation."""
        return {}

    @staticmethod
    def _from_dict(dict_data: dict):
        """Creates an Object3D (or its subclass) from a dict."""
        if not isinstance(dict_data, dict):
            raise ValueError("json_data must be a dictionary")

        cls_name = dict_data.get("_type", "Object3D")
        clz = getattr(threed, cls_name, Object3D)

        clz_main_args = {
            k: v
            for k, v in dict_data.items()
            if k
            not in [
                "_type",
                FO3D_VERSION_KEY,
                "uuid",
                "name",
                "visible",
                "children",
                "position",
                "quaternion",
                "scale",
                "default_material",
            ]
        }

        if cls_name == "Scene":
            # `Scene` has no name or visibility
            obj = clz(**clz_main_args)
        else:
            obj = clz(
                name=dict_data.get("name", ""),
                visible=dict_data.get("visible", True),
                **clz_main_args,
            )

            material = dict_data.get("default_material", None)

            if material is not None:
                obj.set_default_material(material)

        obj.position = Vector3(*dict_data.get("position", [0, 0, 0]))
        obj.quaternion = Quaternion(*dict_data.get("quaternion", [0, 0, 0, 1]))
        obj.scale = Vector3(*dict_data.get("scale", [1, 1, 1]))

        obj._uuid = dict_data.get("uuid", str(uuid.uuid4()))

        # recursively handle children
        for child_json in dict_data.get("children", []):
            child = Object3D._from_dict(child_json)
            obj.add(child)

        return obj
