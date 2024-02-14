"""
| Copyright 2017-2024, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""

from math import pi as PI

from pydantic.dataclasses import dataclass

from .object_3d import Object3D
from .transformation import Vec3UnionType, Vector3
from .validators import vec3_normalizing_validator

COLOR_DEFAULT_WHITE = "#ffffff"


@dataclass
class Light(Object3D):
    """Base class for 3D lights.

    Args:
        color ("#ffffff"): the color of the light
        intensity (1.0): the intensity of the light in the range [0, 1]
    """

    color: str = COLOR_DEFAULT_WHITE
    intensity: float = 1.0

    def _to_dict_extra(self):
        return super()._to_dict_extra() | {
            "color": self.color,
            "intensity": self.intensity,
        }


@dataclass
class AmbientLight(Light):
    """Represents an ambient light.

    This light globally illuminates all objects in the scene equally.
    """

    pass


@dataclass
class DirectionalLight(Light):
    """Represents a directional light.

    A light that gets emitted in a specific direction.
    This light will behave as though it is infinitely
    far away and the rays produced from it are all parallel.

    Args:
        target ([0,0,0]): the target of the light
    """

    target: Vec3UnionType = Vector3(0, 0, 0)

    _ensure_target_is_normalized = vec3_normalizing_validator("target")

    def _to_dict_extra(self):
        return super()._to_dict_extra() | {
            "target": self.target.to_arr().tolist()
        }


@dataclass
class PointLight(Light):
    """Represents a point light.

    Args:
        distance (0.0): the distance at which the light's intensity is zero
        decay (2.0): the amount the light dims along the distance of the light
    """

    distance: float = 0.0
    decay: float = 2.0

    def _to_dict_extra(self):
        return super()._to_dict_extra() | {
            "distance": self.distance,
            "decay": self.decay,
        }


@dataclass
class SpotLight(Light):
    """Represents a spot light.

    Args:
        target ([0,0,0]): the target of the light
        distance (0.0): the distance at which the light's intensity is zero
        decay (2.0): the amount the light dims along the distance of the light
        angle (PI / 3): the angle of the light's spotlight, in radians
        penumbra (0.0): the angle of the penumbra of the light's spotlight, in radians
    """

    target: Vec3UnionType = Vector3(0, 0, 0)
    distance: float = 0.0
    decay: float = 2.0
    angle: float = PI / 3
    penumbra: float = 0.0

    _ensure_target_is_normalized = vec3_normalizing_validator("target")

    def _to_dict_extra(self):
        return super()._to_dict_extra() | {
            "target": self.target.to_arr().tolist(),
            "distance": self.distance,
            "decay": self.decay,
            "angle": self.angle,
            "penumbra": self.penumbra,
        }
