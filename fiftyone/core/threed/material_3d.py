"""
Material definition for 3D visualization.

| Copyright 2017-2025, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""

from typing import Literal

import fiftyone.core.utils as fou

from .validators import (
    BaseValidatedDataClass,
    validate_bool,
    validate_choice,
    validate_color,
    validate_float,
)

threed = fou.lazy_import("fiftyone.core.threed")

COLOR_DEFAULT_GRAY = "#808080"
COLOR_DEFAULT_DARK_GRAY = "#111111"
COLOR_DEFAULT_WHITE = "#ffffff"
COLOR_DEFAULT_BLACK = "#000000"


class Material3D(BaseValidatedDataClass):
    """Base class for 3D materials.

    Args:
        opacity (1.0): the opacity of the material, in the range ``[0, 1]``
    """

    def __init__(self, opacity: float = 1.0):
        self.opacity = opacity

    @property
    def opacity(self) -> float:
        return self._opacity

    @opacity.setter
    def opacity(self, value: float) -> None:
        self._opacity = validate_float(value)

    def as_dict(self):
        return {
            "_type": self.__class__.__name__,
            "opacity": self.opacity,
        }

    @staticmethod
    def _from_dict(d):
        cls_name: str = d.pop("_type")
        if not cls_name.endswith("Material"):
            raise ValueError("Invalid material type")

        clz = getattr(threed, cls_name)
        return clz(**d)


SHADING_MODES = frozenset(["height", "intensity", "rgb", "custom"])
ShadingMode = Literal["height", "intensity", "rgb", "custom"]


class PointCloudMaterial(Material3D):
    """Represents a point cloud material.

    Args:
        shading_mode ("height"): the shading mode to use. Supported values are
            "height", "intensity", "rgb", and "custom"
        custom_color ("#ffffff"): a custom color to use for the point cloud.
            This is only used when `shading_mode` is "custom"
        point_size (1.0): the size of the points in the point cloud
        attenuate_by_distance (False): whether to attenuate the point size
            based on distance from the camera
        opacity (1.0): the opacity of the material, in the range ``[0, 1]``
    """

    def __init__(
        self,
        shading_mode: ShadingMode = "height",
        custom_color: str = COLOR_DEFAULT_WHITE,
        point_size: float = 1.0,
        attenuate_by_distance: bool = False,
        opacity: float = 1.0,
    ):
        super().__init__(opacity=opacity)
        self.shading_mode = shading_mode
        self.custom_color = custom_color
        self.point_size = point_size
        self.attenuate_by_distance = attenuate_by_distance

    @property
    def shading_mode(self) -> ShadingMode:
        return self._shading_mode

    @shading_mode.setter
    def shading_mode(self, value: ShadingMode) -> None:
        self._shading_mode = validate_choice(value, SHADING_MODES)

    @property
    def custom_color(self) -> str:
        return self._custom_color

    @custom_color.setter
    def custom_color(self, value: str) -> None:
        self._custom_color = validate_color(value)

    @property
    def point_size(self) -> float:
        return self._point_size

    @point_size.setter
    def point_size(self, value: float) -> None:
        self._point_size = validate_float(value)

    @property
    def attenuate_by_distance(self) -> bool:
        return self._attenuate_by_distance

    @attenuate_by_distance.setter
    def attenuate_by_distance(self, value: bool) -> None:
        self._attenuate_by_distance = validate_bool(value)

    def as_dict(self):
        return {
            **super().as_dict(),
            **{
                "shadingMode": self.shading_mode,
                "customColor": self.custom_color,
                "pointSize": self.point_size,
                "attenuateByDistance": self.attenuate_by_distance,
            },
        }


class MeshMaterial(Material3D):
    """Represents a mesh material.

    Args:
        wireframe (False): whether to render the mesh as a wireframe
        opacity (1.0): the opacity of the material, in the range ``[0, 1]``
    """

    def __init__(self, wireframe: bool = False, opacity: float = 1.0):
        super().__init__(opacity)
        self.wireframe = wireframe

    @property
    def wireframe(self) -> bool:
        return self._wireframe

    @wireframe.setter
    def wireframe(self, value: bool) -> None:
        self._wireframe = validate_bool(value)

    def as_dict(self):
        return {**super().as_dict(), **{"wireframe": self.wireframe}}


class MeshBasicMaterial(MeshMaterial):
    """Represents a basic mesh material.

    This material is not affected by lights, and is rendered as a solid color.

    Args:
        color ("#808080"): the color of the material
        wireframe (False): whether to render the mesh as a wireframe
        opacity (1.0): the opacity of the material, in the range ``[0, 1]``
    """

    def __init__(
        self,
        color: str = COLOR_DEFAULT_GRAY,
        wireframe: bool = False,
        opacity: float = 1.0,
    ):
        super().__init__(wireframe=wireframe, opacity=opacity)
        self.color = color

    @property
    def color(self) -> str:
        return self._color

    @color.setter
    def color(self, value: str) -> None:
        self._color = validate_color(value)

    def as_dict(self):
        return {**super().as_dict(), **{"color": self.color}}


class MeshStandardMaterial(MeshMaterial):
    """Represents a standard mesh material.

    This material is a standard physically-based rendering (PBR) material.
    This material is ideal for most use cases.

    Args:
        color ("#808080"): the color of the material
        emissive_color ("#000000"): the emissive color of the material.
            This is the color emitted by the material itself independent of the
            light
        emissive_intensity (0.0): the intensity of the emissive color
        metalness (0.0): the metalness of the material
        roughness (1.0): the roughness of the material
        wireframe (False): whether to render the mesh as a wireframe
        opacity (1.0): the opacity of the material, in the range ``[0, 1]``
    """

    def __init__(
        self,
        color: str = COLOR_DEFAULT_GRAY,
        emissive_color: str = COLOR_DEFAULT_BLACK,
        emissive_intensity: float = 0.0,
        metalness: float = 0.0,
        roughness: float = 1.0,
        wireframe: bool = False,
        opacity: float = 1.0,
    ):
        super().__init__(wireframe=wireframe, opacity=opacity)
        self.color = color
        self.emissive_color = emissive_color
        self.emissive_intensity = emissive_intensity
        self.metalness = metalness
        self.roughness = roughness

    @property
    def color(self) -> str:
        return self._color

    @color.setter
    def color(self, value: str) -> None:
        self._color = validate_color(value)

    @property
    def emissive_color(self) -> str:
        return self._emissive_color

    @emissive_color.setter
    def emissive_color(self, value: str) -> None:
        self._emissive_color = validate_color(value)

    @property
    def emissive_intensity(self) -> float:
        return self._emissive_intensity

    @emissive_intensity.setter
    def emissive_intensity(self, value: float) -> None:
        self._emissive_intensity = validate_float(value)

    @property
    def metalness(self) -> float:
        return self._metalness

    @metalness.setter
    def metalness(self, value: float) -> None:
        self._metalness = validate_float(value)

    @property
    def roughness(self) -> float:
        return self._roughness

    @roughness.setter
    def roughness(self, value: float) -> None:
        self._roughness = validate_float(value)

    def as_dict(self):
        return {
            **super().as_dict(),
            **{
                "color": self.color,
                "emissiveColor": self.emissive_color,
                "emissiveIntensity": self.emissive_intensity,
                "metalness": self.metalness,
                "roughness": self.roughness,
            },
        }


class MeshLambertMaterial(MeshMaterial):
    """Represents a Lambert mesh material.

    This material only takes into account diffuse reflections, and ignores
    specular reflection. This is ideal for materials that reflect light evenly
    without a glossy or shiny appearance, such as unpolished surfaces.

    Args:
        color ("#808080"): the color of the material
        emissive_color ("#000000"): the emissive color of the material.
            This is the color emitted by the material itself independent of
            the light
        emissive_intensity (0.0): the intensity of the emissive color
        reflectivity (1.0): the reflectivity of the material
        refraction_ratio (0.98): the refraction ratio (IOR) of the material
        wireframe (False): whether to render the mesh as a wireframe
        opacity (1.0): the opacity of the material, in the range ``[0, 1]``
    """

    def __init__(
        self,
        color: str = COLOR_DEFAULT_GRAY,
        emissive_color: str = COLOR_DEFAULT_BLACK,
        emissive_intensity: float = 0.0,
        reflectivity: float = 1.0,
        refraction_ratio: float = 0.98,
        wireframe: bool = False,
        opacity: float = 1.0,
    ):
        super().__init__(wireframe=wireframe, opacity=opacity)
        self.color = color
        self.emissive_color = emissive_color
        self.emissive_intensity = emissive_intensity
        self.reflectivity = reflectivity
        self.refraction_ratio = refraction_ratio

    @property
    def color(self) -> str:
        return self._color

    @color.setter
    def color(self, value: str) -> None:
        self._color = validate_color(value)

    @property
    def emissive_color(self) -> str:
        return self._emissive_color

    @emissive_color.setter
    def emissive_color(self, value: str) -> None:
        self._emissive_color = validate_color(value)

    @property
    def emissive_intensity(self) -> float:
        return self._emissive_intensity

    @emissive_intensity.setter
    def emissive_intensity(self, value: float) -> None:
        self._emissive_intensity = validate_float(value)

    @property
    def reflectivity(self) -> float:
        return self._reflectivity

    @reflectivity.setter
    def reflectivity(self, value: float) -> None:
        self._reflectivity = validate_float(value)

    @property
    def refraction_ratio(self) -> float:
        return self._refraction_ratio

    @refraction_ratio.setter
    def refraction_ratio(self, value: float) -> None:
        self._refraction_ratio = validate_float(value)

    def as_dict(self):
        return {
            **super().as_dict(),
            **{
                "color": self.color,
                "emissiveColor": self.emissive_color,
                "emissiveIntensity": self.emissive_intensity,
                "reflectivity": self.reflectivity,
                "refractionRatio": self.refraction_ratio,
            },
        }


class MeshPhongMaterial(MeshLambertMaterial):
    """Represents a Phong mesh material.

    This material takes into account specular reflection. This is ideal for
    materials that reflect light with a glossy or shiny appearance, such as
    polished surfaces.

    Args:
        shininess (30.0): the shininess of the material
        specular_color ("#111111"): the specular color of the material
        color ("#808080"): the color of the material
        emissive_color ("#000000"): the emissive color of the material.
            This is the color emitted by the material itself independent of
            the light
        emissive_intensity (0.0): the intensity of the emissive color
        reflectivity (1.0): the reflectivity of the material
        refraction_ratio (0.98): the refraction ratio (IOR) of the material
        wireframe (False): whether to render the mesh as a wireframe
        opacity (1.0): the opacity of the material, in the range ``[0, 1]``
    """

    def __init__(
        self,
        shininess: float = 30.0,
        specular_color: str = COLOR_DEFAULT_DARK_GRAY,
        color: str = COLOR_DEFAULT_GRAY,
        emissive_color: str = COLOR_DEFAULT_BLACK,
        emissive_intensity: float = 0.0,
        reflectivity: float = 1.0,
        refraction_ratio: float = 0.98,
        wireframe: bool = False,
        opacity: float = 1.0,
    ):
        super().__init__(
            color=color,
            emissive_color=emissive_color,
            emissive_intensity=emissive_intensity,
            reflectivity=reflectivity,
            refraction_ratio=refraction_ratio,
            wireframe=wireframe,
            opacity=opacity,
        )
        self.shininess = shininess
        self.specular_color = specular_color

    @property
    def shininess(self) -> float:
        return self._shininess

    @shininess.setter
    def shininess(self, value: float) -> None:
        self._shininess = validate_float(value)

    @property
    def specular_color(self) -> str:
        return self._specular_color

    @specular_color.setter
    def specular_color(self, value: str) -> None:
        self._specular_color = validate_color(value)

    def as_dict(self):
        return {
            **super().as_dict(),
            **{
                "shininess": self.shininess,
                "specularColor": self.specular_color,
            },
        }


class MeshDepthMaterial(MeshMaterial):
    """Represents a depth mesh material.

    This material is used for drawing geometry by depth, where depth is based
    off of the camera near and far plane. White is nearest, black is farthest.

    Args:
        wireframe (False): whether to render the mesh as a wireframe
        opacity (1.0): the opacity of the material, in the range ``[0, 1]``
    """

    pass
