from pydantic.dataclasses import dataclass

from typing import Literal

COLOR_DEFAULT_GRAY = "#808080"
COLOR_DEFAULT_DARK_GRAY = "#111111"
COLOR_DEFAULT_WHITE = "#ffffff"
COLOR_DEFAULT_BLACK = "#000000"


@dataclass
class Material3D:
    """Base class for 3D materials.

    Args:
        opacity (1.0): the opacity of the material, in the range [0, 1]
        transparent (False): whether the material is transparent
        vertex_colors (False): whether the material uses vertex colors
    """

    opacity: float = 1.0
    transparent: bool = False
    vertex_colors: bool = False


@dataclass
class PointcloudMaterial(Material3D):
    """Represents a point cloud material.

    Args:
        shading_mode ("height"): the shading mode to use. Supported values are
            "height", "intensity", "rgb", and "custom"
        custom_color ("#ffffff"): a custom color to use for the point cloud.
            This is only used when `shading_mode` is "custom"
        point_size (1.0): the size of the points in the point cloud
        attenuate_by_distance (False): whether to attenuate the point size
            based on distance from the camera
    """

    shading_mode: Literal["height", "intensity", "rgb", "custom"] = "height"
    custom_color: str = COLOR_DEFAULT_WHITE
    point_size: float = 0.5
    attenuate_by_distance: bool = False


@dataclass
class MeshMaterial(Material3D):
    """Represents a mesh material."""

    wireframe: bool = False


@dataclass
class MeshBasicMaterial(MeshMaterial):
    """Represents a basic mesh material.

    This material is not affected by lights,
    and is rendered as a solid color.

    Args:
        color ("#ffffff"): the color of the material
    """

    color: str = COLOR_DEFAULT_GRAY


@dataclass
class MeshLambertMaterial(MeshMaterial):
    """Represents a Lambert mesh material.

    This material only takes into account diffuse reflections,
    and ignores specular reflection. This is ideal for materials
    that reflect light evenly without a glossy or shiny appearance,
    such as unpolished surfaces.

    Args:
        color ("#ffffff"): the color of the material
        emissive_color ("#000000"): the emissive color of the material.
            This is the color emitted by the material itself independent of the light.
        emissive_intensity (0.0): the intensity of the emissive color
        reflectivity (1.0): the reflectivity of the material
        refraction_ratio (0.98): the refraction ratio of the material
    """

    color: str = COLOR_DEFAULT_GRAY
    emissive_color: str = COLOR_DEFAULT_BLACK
    emissive_intensity: float = 0.0
    reflectivity: float = 1.0
    refraction_ratio: float = 0.98


@dataclass
class MeshPhongMaterial(MeshMaterial):
    """Represents a Phong mesh material.

    This material takes into account specular reflection.
    This is ideal for materials that reflect light with a glossy or shiny appearance,
    such as polished surfaces.

    Args:
        color ("#ffffff"): the color of the material
        emissive_color ("#000000"): the emissive color of the material.
        This is the color emitted by the material itself independent of the light.
        emissive_intensity (0.0): the intensity of the emissive color
        shininess (30): the shininess of the material
        reflectivity (1.0): the reflectivity of the material
        refraction_ratio (0.98): the refraction ratio of the material
    """

    color: str = COLOR_DEFAULT_GRAY
    emissive_color: str = COLOR_DEFAULT_BLACK
    emissive_intensity: float = 0.0
    shininess: float = 30.0
    specular_color: str = COLOR_DEFAULT_DARK_GRAY
    reflectivity: float = 1.0
    refraction_ratio: float = 0.98


@dataclass
class MeshDepthMaterial(MeshMaterial):
    """Represents a depth mesh material.

    This material is used for drawing geometry by depth,
    where depth is based off of the camera near and far plane.
    White is nearest, black is farthest.
    """

    pass
