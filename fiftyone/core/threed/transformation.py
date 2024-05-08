import numbers
from typing import List, Literal, Optional, Tuple, Union

import numpy as np
from scipy.spatial.transform import Rotation

from .validators import (
    BaseValidatedDataClass,
    validate_bool,
    validate_choice,
    validate_float,
    validate_list,
)


EULER_AXES_SEQUENCES = frozenset(["XYZ", "XZY", "YXZ", "YZX", "ZXY", "ZYX"])
EulerAxesSequence = Literal["XYZ", "XZY", "YXZ", "YZX", "ZXY", "ZYX"]


class Vector3(BaseValidatedDataClass):
    """Represents a three-dimensional vector."""

    def __init__(
        self,
        x: float = 0.0,
        y: float = 0.0,
        z: float = 0.0,
    ):
        self._x = validate_float(x)
        self._y = validate_float(y)
        self._z = validate_float(z)

    @property
    def x(self) -> float:
        return self._x

    @property
    def y(self) -> float:
        return self._y

    @property
    def z(self) -> float:
        return self._z

    def to_arr(self):
        """Converts the vector to a numpy array."""
        return np.array([self.x, self.y, self.z])


class Euler(Vector3):
    """Represents intrinsic rotations about the object's own principal axes."""

    def __init__(
        self,
        x: float = 0.0,
        y: float = 0.0,
        z: float = 0.0,
        degrees: bool = False,
        sequence: EulerAxesSequence = "XYZ",
    ):
        super().__init__(x, y, z)
        self._degrees = validate_bool(degrees)
        self._sequence = validate_choice(sequence, EULER_AXES_SEQUENCES, False)

    @property
    def degrees(self) -> bool:
        return self._degrees

    @property
    def sequence(self) -> EulerAxesSequence:
        return self._sequence

    def to_quaternion(self):
        """Converts the euler angles to a quaternion."""
        q = Rotation.from_euler(
            self.sequence, [self.x, self.y, self.z], degrees=self.degrees
        )
        return Quaternion(*q.as_quat())


class Quaternion(BaseValidatedDataClass):
    """Represents a quaternion."""

    def __init__(
        self,
        x: float = 0.0,
        y: float = 0.0,
        z: float = 0.0,
        w: float = 1.0,
    ):
        self._x = validate_float(x)
        self._y = validate_float(y)
        self._z = validate_float(z)
        self._w = validate_float(w)

    @property
    def x(self) -> float:
        return self._x

    @property
    def y(self) -> float:
        return self._y

    @property
    def z(self) -> float:
        return self._z

    @property
    def w(self) -> float:
        return self._w

    def to_euler(self, degrees=False, sequence="XYZ"):
        """Converts the quaternion into euler angles."""
        q = Rotation.from_quat([self.x, self.y, self.z, self.w])
        return Euler(*q.as_euler(sequence, degrees=degrees))

    def to_arr(self):
        """Converts the quaternion to a numpy array."""
        return np.array([self.x, self.y, self.z, self.w])


Vec3UnionType = Union[Vector3, List[float], Tuple[float], np.array]


def normalize_to_vec3(v: Optional[Vec3UnionType]) -> Union[Vector3, None]:
    if v is None or isinstance(v, Vector3):
        return v

    try:
        item_list = validate_list(v, 3)

    except ValueError as e:
        raise ValueError(
            "Expected a list / tuple of length 3 or a Vector3"
        ) from e

    return Vector3(*item_list)


def coerce_to_vec3(v: Optional[Vec3UnionType]) -> Union[Vector3, None]:
    if v is None:
        return None

    if isinstance(v, (int, float, numbers.Real)):
        return Vector3(v, v, v)

    return normalize_to_vec3(v)
