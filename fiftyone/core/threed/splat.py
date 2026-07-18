"""
Gaussian splat definitions for 3D visualization.

| Copyright 2017-2026, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""

from typing import Optional

from .object_3d import Object3D
from .transformation import Quaternion, Vec3UnionType
from .validators import validate_color, validate_float

SUPPORTED_GAUSSIAN_SPLAT_EXTENSIONS = (
    ".ply",
    ".spz",
    ".splat",
    ".ksplat",
    ".sog",
    ".rad",
)
SUPPORTED_GAUSSIAN_SPLAT_FORMATS = tuple(
    extension.removeprefix(".")
    for extension in SUPPORTED_GAUSSIAN_SPLAT_EXTENSIONS
)


class GaussianSplat(Object3D):
    """Represents a Gaussian splat asset.

    Args:
        name (str): the name of the splat
        splat_path (str): the path to the splat file. The path may be either
            absolute or relative to the directory containing the ``.fo3d``
            file
        format (None): an optional file format hint, such as ``"ply"``,
            ``"spz"``, ``"splat"``, ``"ksplat"``, ``"sog"``, or
            ``"rad"``. A recognized hint permits extensionless or opaque
            paths. A ``.zip`` path is accepted only when the format is
            explicitly set to ``"sog"``
        center_geometry (True): whether to center the splat geometry
        visible (True): default visibility of the splat in the scene
        position (None): the position of the splat in object space
        quaternion (None): the quaternion of the splat in object space
        scale (None): the scale of the splat in object space
        opacity (1.0): the opacity multiplier for the splat, in the range
            ``[0, 1]``
        tint ("#ffffff"): a color multiplier applied to the splat

    Raises:
        ValueError: if the path or format is not supported
    """

    _asset_path_fields = ["splat_path"]

    def __init__(
        self,
        name: str,
        splat_path: str,
        format: Optional[str] = None,
        center_geometry: bool = True,
        visible=True,
        position: Optional[Vec3UnionType] = None,
        scale: Optional[Vec3UnionType] = None,
        quaternion: Optional[Quaternion] = None,
        *,
        opacity: float = 1.0,
        tint: str = "#ffffff",
    ):
        super().__init__(
            name=name,
            visible=visible,
            position=position,
            scale=scale,
            quaternion=quaternion,
        )

        normalized_format = (
            None
            if format is None
            else str(format).strip().lower().removeprefix(".")
        )
        if (
            normalized_format is not None
            and normalized_format not in SUPPORTED_GAUSSIAN_SPLAT_FORMATS
        ):
            raise ValueError("Unsupported Gaussian splat format '%s'" % format)

        path_without_url_suffix = splat_path.split("?", 1)[0].split("#", 1)[0]
        normalized_path = path_without_url_suffix.lower()
        is_zip = normalized_path.endswith(".zip")
        if is_zip and normalized_format != "sog":
            raise ValueError("A .zip Gaussian splat must use format='sog'")

        if (
            not is_zip
            and normalized_format is None
            and not normalized_path.endswith(
                SUPPORTED_GAUSSIAN_SPLAT_EXTENSIONS
            )
        ):
            raise ValueError(
                "Gaussian splat must be a .ply, .spz, .splat, .ksplat, "
                ".sog, or .rad file"
            )

        self.splat_path = splat_path
        self.format = normalized_format
        self.center_geometry = center_geometry
        self.opacity = opacity
        self.tint = tint

    @property
    def opacity(self) -> float:
        """The opacity multiplier for the splat."""
        return self._opacity

    @opacity.setter
    def opacity(self, value: float) -> None:
        opacity = validate_float(value)
        if not 0 <= opacity <= 1:
            raise ValueError(
                "Gaussian splat opacity must be in the range [0, 1]"
            )

        self._opacity = opacity

    @property
    def tint(self) -> str:
        """The color multiplier for the splat."""
        return self._tint

    @tint.setter
    def tint(self, value: str) -> None:
        self._tint = validate_color(value)

    def _to_dict_extra(self):
        r = {
            "splatPath": self.splat_path,
            "format": self.format,
            "centerGeometry": self.center_geometry,
            "opacity": self.opacity,
            "tint": self.tint,
        }

        if hasattr(self, "_pre_transformed_splat_path"):
            r["preTransformedSplatPath"] = self._pre_transformed_splat_path

        return r
