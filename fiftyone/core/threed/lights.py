"""
Lights definition for 3D visualization.

| Copyright 2017-2025, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""

from math import pi as PI
from typing import Optional, Union

from .object_3d import Object3D

from .transformation import (
    Quaternion,
    Vec3UnionType,
    Vector3,
    normalize_to_vec3,
)

COLOR_DEFAULT_WHITE = "#ffffff"


class Light(Object3D):
    """Base class for 3D lights.

    Args:
        color ("#ffffff"): the color of the light
        intensity (1.0): the intensity of the light in the range ``[0, 1]``
        visible (True): default visibility of the object in the scene
        position (None): the position of the light in object space
        quaternion (None): the quaternion of the light in object space
        scale (None): the scale of the light in object space
    """

    def __init__(
        self,
        name: Union[str, None] = None,
        color: str = COLOR_DEFAULT_WHITE,
        intensity: float = 1.0,
        visible=True,
        position: Optional[Vec3UnionType] = None,
        scale: Optional[Vec3UnionType] = None,
        quaternion: Optional[Quaternion] = None,
    ):
        super().__init__(
            name=name or self.__class__.__name__,
            visible=visible,
            position=position,
            scale=scale,
            quaternion=quaternion,
        )
        self.color = color
        self.intensity = intensity

    def _to_dict_extra(self):
        return {
            **super()._to_dict_extra(),
            **{
                "color": self.color,
                "intensity": self.intensity,
            },
        }


class AmbientLight(Light):
    """Represents an ambient light.

    This light globally illuminates all objects in the scene equally.

    Args:
        name ("AmbientLight"): the name of the light
        intensity (0.1): the intensity of the light in the range ``[0, 1]``
        color ("#ffffff"): the color of the light
        visible (True): default visibility of the object in the scene
        position (None): the position of the light in object space
        quaternion (None): the quaternion of the light in object space
        scale (None): the scale of the light in object space
    """

    def __init__(
        self,
        name: str = "AmbientLight",
        intensity: float = 0.1,
        color: str = COLOR_DEFAULT_WHITE,
        visible=True,
        position: Optional[Vec3UnionType] = None,
        scale: Optional[Vec3UnionType] = None,
        quaternion: Optional[Quaternion] = None,
    ):
        super().__init__(
            name=name,
            intensity=intensity,
            color=color,
            visible=visible,
            position=position,
            scale=scale,
            quaternion=quaternion,
        )

    def __repr__(self):
        kwargs_list = []
        for k, v in [
            ("name", self.name),
            ("color", self.color),
            ("intensity", self.intensity),
        ]:
            kwargs_list.append(f"{k}={repr(v)}")
        return f"{self.__class__.__name__}({', '.join(kwargs_list)})"


class DirectionalLight(Light):
    """Represents a directional light.

    A light that gets emitted in a specific direction. This light will behave
    as though it is infinitely far away and the rays produced from it are all
    parallel.

    Args:
        name ("DirectionalLight"): the name of the light
        target ([0,0,0]): the target of the light
        color ("#ffffff"): the color of the light
        intensity (1.0): the intensity of the light in the range ``[0, 1]``
        visible (True): default visibility of the object in the scene
        position (None): the position of the light in object space
        quaternion (None): the quaternion of the light in object space
        scale (None): the scale of the light in object space
    """

    target: Vec3UnionType = Vector3(0, 0, 0)

    def __init__(
        self,
        name: str = "DirectionalLight",
        target: Vec3UnionType = Vector3(0, 0, 0),
        color: str = COLOR_DEFAULT_WHITE,
        intensity: float = 1.0,
        visible=True,
        position: Optional[Vec3UnionType] = None,
        scale: Optional[Vec3UnionType] = None,
        quaternion: Optional[Quaternion] = None,
    ):
        super().__init__(
            name=name,
            color=color,
            intensity=intensity,
            visible=visible,
            position=position,
            scale=scale,
            quaternion=quaternion,
        )
        self.target = normalize_to_vec3(target)

    def __repr__(self):
        kwargs_list = []
        for k, v in [
            ("name", self.name),
            ("target", self.target),
            ("color", self.color),
            ("intensity", self.intensity),
        ]:
            kwargs_list.append(f"{k}={repr(v)}")
        return f"{self.__class__.__name__}({', '.join(kwargs_list)})"

    def _to_dict_extra(self):
        return {
            **super()._to_dict_extra(),
            **{"target": self.target.to_arr().tolist()},
        }


class PointLight(Light):
    """Represents a point light.

    Args:
        name ("PointLight"): the name of the light
        distance (0.0): the distance at which the light's intensity is zero
        decay (2.0): the amount the light dims along the distance of the light
        color ("#ffffff"): the color of the light
        intensity (1.0): the intensity of the light in the range ``[0, 1]``
        visible (True): default visibility of the object in the scene
        position (None): the position of the light in object space
        quaternion (None): the quaternion of the light in object space
        scale (None): the scale of the light in object space
    """

    def __init__(
        self,
        name: str = "PointLight",
        distance: float = 0.0,
        decay: float = 2.0,
        color: str = COLOR_DEFAULT_WHITE,
        intensity: float = 1.0,
        visible=True,
        position: Optional[Vec3UnionType] = None,
        scale: Optional[Vec3UnionType] = None,
        quaternion: Optional[Quaternion] = None,
    ):
        super().__init__(
            name=name,
            color=color,
            intensity=intensity,
            visible=visible,
            position=position,
            scale=scale,
            quaternion=quaternion,
        )
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
            kwargs_list.append(f"{k}={repr(v)}")
        return f"{self.__class__.__name__}({', '.join(kwargs_list)})"

    def _to_dict_extra(self):
        return {
            **super()._to_dict_extra(),
            **{
                "distance": self.distance,
                "decay": self.decay,
            },
        }


class SpotLight(Light):
    """Represents a spot light.

    Args:
        name ("SpotLight"): the name of the light
        target ([0,0,0]): the target of the light
        distance (0.0): the distance at which the light's intensity is zero
        decay (2.0): the amount the light dims along the distance of the light
        angle (PI / 3): the angle of the light's spotlight, in radians
        penumbra (0.0): the angle of the penumbra of the light's spotlight, in radians
        color ("#ffffff"): the color of the light
        intensity (1.0): the intensity of the light in the range ``[0, 1]``
        visible (True): default visibility of the object in the scene
        position (None): the position of the light in object space
        quaternion (None): the quaternion of the light in object space
        scale (None): the scale of the light in object space"""

    def __init__(
        self,
        name: str = "SpotLight",
        target: Vec3UnionType = None,
        distance: float = 0.0,
        decay: float = 2.0,
        angle: float = PI / 3,
        penumbra: float = 0.0,
        color: str = COLOR_DEFAULT_WHITE,
        intensity: float = 1.0,
        visible=True,
        position: Optional[Vec3UnionType] = None,
        scale: Optional[Vec3UnionType] = None,
        quaternion: Optional[Quaternion] = None,
    ):
        super().__init__(
            name=name,
            color=color,
            intensity=intensity,
            visible=visible,
            position=position,
            scale=scale,
            quaternion=quaternion,
        )
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
            kwargs_list.append(f"{k}={repr(v)}")
        return f"{self.__class__.__name__}({', '.join(kwargs_list)})"

    def _to_dict_extra(self):
        return {
            **super()._to_dict_extra(),
            **{
                "target": self.target.to_arr().tolist(),
                "distance": self.distance,
                "decay": self.decay,
                "angle": self.angle,
                "penumbra": self.penumbra,
            },
        }
