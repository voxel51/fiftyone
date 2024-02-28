"""
| Copyright 2017-2024, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""

from math import pi as PI

from .object_3d import Object3D
from .transformation import Vec3UnionType, Vector3
from .validators import normalize_to_vec3

COLOR_DEFAULT_WHITE = "#ffffff"


class Light(Object3D):
    """Base class for 3D lights.

    Args:
        color ("#ffffff"): the color of the light
        intensity (1.0): the intensity of the light in the range [0, 1]
    """

    def __init__(
        self,
        color: str = COLOR_DEFAULT_WHITE,
        intensity: float = 1.0,
        **kwargs,
    ):
        # remove 'name' from kwargs, if present
        kwargs = {k: v for k, v in kwargs.items() if k != "name"}
        super().__init__(name=self.__class__.__name__, **kwargs)
        self.color = color
        self.intensity = intensity

    def _to_dict_extra(self):
        return super()._to_dict_extra() | {
            "color": self.color,
            "intensity": self.intensity,
        }


class AmbientLight(Light):
    """Represents an ambient light.

    This light globally illuminates all objects in the scene equally.

    Args:
        intensity (0.1): the intensity of the light in the range [0, 1]
        color ("#ffffff"): the color of the light
        kwargs: arbitrary keyword arguments for
            :class:`fiftyone.core.threed.Object3D` base class
    """

    def __init__(
        self,
        intensity: float = 0.1,
        color: str = COLOR_DEFAULT_WHITE,
        **kwargs,
    ):
        super().__init__(intensity=intensity, color=color, **kwargs)

    def __repr__(self):
        kwargs_list = []
        for k, v in [
            ("name", self.name),
            ("color", self.color),
            ("intensity", self.intensity),
        ]:
            kwargs_list.append(f"{k}={v if not isinstance(v, (str)) else v!r}")
        return f"{self.__class__.__name__}({', '.join(kwargs_list)})"


class DirectionalLight(Light):
    """Represents a directional light.

    A light that gets emitted in a specific direction.
    This light will behave as though it is infinitely
    far away and the rays produced from it are all parallel.

    Args:
        target ([0,0,0]): the target of the light
        color ("#ffffff"): the color of the light
        intensity (1.0): the intensity of the light in the range [0, 1]
        kwargs: arbitrary keyword arguments for
            :class:`fiftyone.core.threed.Object3D` base class
    """

    target: Vec3UnionType = Vector3(0, 0, 0)

    def __init__(
        self,
        target: Vec3UnionType = Vector3(0, 0, 0),
        color: str = COLOR_DEFAULT_WHITE,
        intensity: float = 1.0,
        **kwargs,
    ):
        super().__init__(color=color, intensity=intensity, **kwargs)
        self.target = normalize_to_vec3(target)

    def __repr__(self):
        kwargs_list = []
        for k, v in [
            ("name", self.name),
            ("target", self.target),
            ("color", self.color),
            ("intensity", self.intensity),
        ]:
            kwargs_list.append(f"{k}={v if not isinstance(v, (str)) else v!r}")
        return f"{self.__class__.__name__}({', '.join(kwargs_list)})"

    def _to_dict_extra(self):
        return super()._to_dict_extra() | {
            "target": self.target.to_arr().tolist()
        }


class PointLight(Light):
    """Represents a point light.

    Args:
        distance (0.0): the distance at which the light's intensity is zero
        decay (2.0): the amount the light dims along the distance of the light
        color ("#ffffff"): the color of the light
        intensity (1.0): the intensity of the light in the range [0, 1]
        kwargs: arbitrary keyword arguments for
            :class:`fiftyone.core.threed.Object3D` base class
    """

    def __init__(
        self,
        distance: float = 0.0,
        decay: float = 2.0,
        color: str = COLOR_DEFAULT_WHITE,
        intensity: float = 1.0,
        **kwargs,
    ):
        super().__init__(color=color, intensity=intensity, **kwargs)
        self.distance = distance
        self.decay = decay

    def __repr__(self):
        kwargs_list = []
        for k, v in [
            ("name", self.name),
            ("distance", self.distance),
            ("decay", self.decay),
            ("color", self.color),
            ("intensity", self.intensity),
        ]:
            kwargs_list.append(f"{k}={v if not isinstance(v, (str)) else v!r}")
        return f"{self.__class__.__name__}({', '.join(kwargs_list)})"

    def _to_dict_extra(self):
        return super()._to_dict_extra() | {
            "distance": self.distance,
            "decay": self.decay,
        }


class SpotLight(Light):
    """Represents a spot light.

    Args:
        target ([0,0,0]): the target of the light
        distance (0.0): the distance at which the light's intensity is zero
        decay (2.0): the amount the light dims along the distance of the light
        angle (PI / 3): the angle of the light's spotlight, in radians
        penumbra (0.0): the angle of the penumbra of the light's spotlight, in radians
        color ("#ffffff"): the color of the light
        intensity (1.0): the intensity of the light in the range [0, 1]
        kwargs: arbitrary keyword arguments for
            :class:`fiftyone.core.threed.Object3D` base class
    """

    def __init__(
        self,
        target: Vec3UnionType = None,
        distance: float = 0.0,
        decay: float = 2.0,
        angle: float = PI / 3,
        penumbra: float = 0.0,
        color: str = COLOR_DEFAULT_WHITE,
        intensity: float = 1.0,
        **kwargs,
    ):
        super().__init__(color=color, intensity=intensity, **kwargs)
        self.target = normalize_to_vec3(target) if target else Vector3(0, 0, 0)
        self.distance = distance
        self.decay = decay
        self.angle = angle
        self.penumbra = penumbra

    def __repr__(self):
        kwargs_list = []
        for k, v in [
            ("name", self.name),
            ("target", self.target),
            ("distance", self.distance),
            ("decay", self.decay),
            ("angle", self.angle),
            ("penumbra", self.penumbra),
            ("color", self.color),
            ("intensity", self.intensity),
        ]:
            kwargs_list.append(f"{k}={v if not isinstance(v, (str)) else v!r}")
        return f"{self.__class__.__name__}({', '.join(kwargs_list)})"

    def _to_dict_extra(self):
        return super()._to_dict_extra() | {
            "target": self.target.to_arr().tolist(),
            "distance": self.distance,
            "decay": self.decay,
            "angle": self.angle,
            "penumbra": self.penumbra,
        }
