from pydantic.dataclasses import dataclass

from .transformation import Vector3
from .object_3d import Object3D
from math import pi as PI

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

    target: Vector3 = Vector3(0, 0, 0)


@dataclass
class PointLight(Light):
    """Represents a point light.

    Args:
        position (Vector3): the position of the light
        distance (0.0): the distance at which the light's intensity is zero
        decay (2.0): the amount the light dims along the distance of the light
    """

    distance: float = 0.0
    decay: float = 2.0


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

    target: Vector3 = Vector3(0, 0, 0)
    distance: float = 0.0
    decay: float = 2.0
    angle: float = PI / 3
    penumbra: float = 0.0
