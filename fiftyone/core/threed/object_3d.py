"""
Fiftyone 3D Scene.

| Copyright 2017-2024, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""
import uuid
from dataclasses import dataclass

import numpy as np
from scipy.spatial.transform import Rotation


@dataclass(frozen=True)
class Euler:
    """Represents a set of rotations about the 3 principal axes."""

    x: float = 0.0
    y: float = 0.0
    z: float = 0.0

    degrees: bool = False

    def to_quaternion(self):
        """Convert euler angles to a quaternion."""
        q = Rotation.from_euler(
            "xyz", [self.x, self.y, self.z], degrees=self.degrees
        )
        return Quaternion(*q.as_quat())

    def to_arr(self):
        """Convert the euler angles to a numpy array."""
        return np.array([self.x, self.y, self.z])


@dataclass(frozen=True)
class Vector3:
    """Represents a three-dimensional vector."""

    x: float = 0.0
    y: float = 0.0
    z: float = 0.0

    def to_arr(self):
        """Convert the vector to a numpy array."""
        return np.array([self.x, self.y, self.z])


@dataclass(frozen=True)
class Quaternion:
    """Represents a quaternion."""

    x: float = 0.0
    y: float = 0.0
    z: float = 0.0
    w: float = 1.0

    @staticmethod
    def from_matrix(matrix: np.ndarray):
        """Convert a rotation matrix to a quaternion."""
        q = Rotation.from_matrix(matrix)
        return Quaternion(*q.as_quat())

    def to_euler(self, degrees=False):
        """Convert a quaternion into euler angles."""
        q = Rotation.from_quat([self.x, self.y, self.z, self.w])
        return Euler(*q.as_euler("XYZ", degrees=degrees))

    def to_arr(self):
        """Convert the quaternion to a numpy array."""
        return np.array([self.x, self.y, self.z, self.w])


class Object3D:
    """The base class for all 3D objects in the scene."""

    def __init__(self, name="", visible=True):
        self.name = name
        self.visible = visible

        self._position = Vector3()
        self._rotation = Euler()
        self._quaternion = Quaternion()
        self._scale = Vector3(1.0, 1.0, 1.0)
        self._local_transform_matrix = np.eye(4)
        self._uuid = str(uuid.uuid4())

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
    def position(self, value: Vector3):
        self._position = value
        self._update_matrix()

    @property
    def rotation(self):
        """The rotation of the object in object space."""
        return self._rotation

    @rotation.setter
    def rotation(self, value: Euler):
        self._rotation = value
        self._quaternion = value.to_quaternion()
        self._update_matrix()

    @property
    def quaternion(self):
        """The quaternion of the object in object space."""
        return self._quaternion

    @quaternion.setter
    def quaternion(self, value: Quaternion):
        self._quaternion = value
        self._rotation = value.to_euler()
        self._update_matrix()

    @property
    def scale(self):
        """The scale of the object in object space."""
        return self._scale

    @scale.setter
    def scale(self, value: Vector3):
        self._scale = value
        self._update_matrix()

    @property
    def local_transform_matrix(self):
        """The local transform matrix of the object."""
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
        self._quaternion = Quaternion.from_matrix(norm_matrix)
        self._rotation = self._quaternion.to_euler()

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
        self.children.extend(objs)

    def clear(self) -> None:
        """Remove all children from this object."""
        self.children = []

    def _to_json(self):
        """Serializes the object to a JSON representation."""
        data = {
            "name": self.name,
            "visible": self.visible,
            "local_transform_matrix": self.local_transform_matrix.tolist(),
            "uuid": self.uuid,
            "children": [child._toFo3d() for child in self.children],
        }

        return data

    @classmethod
    def _from_json(cls, json_data: dict):
        """Deserializes the object from a JSON representation."""
        if not isinstance(json_data, dict):
            raise ValueError("json_data must be a dictionary")

        obj = cls(
            name=json_data.get("name", ""),
            visible=json_data.get("visible", True),
        )

        matrix_data = json_data.get(
            "local_transform_matrix", np.eye(4).tolist()
        )
        obj.local_transform_matrix = np.array(matrix_data)

        # recursively handle children
        for child_json in json_data.get("children", []):
            child = Object3D._from_json(child_json)
            obj.add(child)

        return obj
