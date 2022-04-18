"""
Dataset sample fields.

| Copyright 2017-2022, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""
from enum import Enum
from re import L
import typing as t

from bson import SON
from bson.binary import Binary
import numpy as np

import fiftyone.core.utils as fou
from fiftyone.core.frame_utils import is_frame_number

foo = fou.lazy_import("fiftyone.core.odm")


def frame_number_validator(value: t.Any) -> None:
    """An integer greater than 0."""
    if not is_frame_number(value):
        raise ValueError("a frame number must be an integer greater than 0")


def heatmap_range_validator(value: t.Any) -> None:
    """A ``[min, max]`` range of the values in a
    :class:`fiftyone.core.labels.Heatmap`.
    """
    if (
        not isinstance(value, (list, tuple))
        or len(value) != 2
        or not value[0] <= value[1]
    ):
        raise ValueError(
            "Heatmap range fields must contain `[min, max]` ranges"
        )


def keypoints_validator(value: t.Any) -> None:
    """A list of ``(x, y)`` coordinate pairs.

    If this field is not set, its default value is ``[]``.
    """
    if not isinstance(value, (list, tuple)) or (
        value
        and (not isinstance(value[0], (list, tuple)) or len(value[0]) != 2)
    ):
        raise ValueError(
            "Keypoints fields must contain a list of (x, y) pairs"
        )


def polyline_points_validator(value: t.Any) -> None:
    """A list of lists of ``(x, y)`` coordinate pairs.

    If this field is not set, its default value is ``[]``.
    """
    if (
        not isinstance(value, (list, tuple))
        or (value and not isinstance(value[0], (list, tuple)))
        or (
            value
            and value[0]
            and (
                not isinstance(value[0][0], (list, tuple))
                or len(value[0][0]) != 2
            )
        )
    ):
        raise ValueError(
            "Polyline points fields must contain a list of lists of "
            "(x, y) pairs"
        )


class GeoType(Enum):

    POINT = "Point"
    """A GeoJSON field storing a longitude and latitude coordinate point.

    The data is stored as ``[longitude, latitude]``.
    """

    LINE_STRING = "LineString"
    """A GeoJSON field storing a line of longitude and latitude coordinates.

    The data is stored as follow::

        [[lon1, lat1], [lon2, lat2], ...]
    """

    POLYGON = "Polygon"
    """A GeoJSON field storing a polygon of longitude and latitude coordinates.

    The data is stored as follows::

        [
            [[lon1, lat1], [lon2, lat2], ...],
            [[lon1, lat1], [lon2, lat2], ...],
            ...
        ]

    where the first element describes the boundary of the polygon and any
    remaining entries describe holes.
    """

    MULTI_POINT = "MultiPoint"
    """A GeoJSON field storing a list of points.

    The data is stored as follows::

        [[lon1, lat1], [lon2, lat2], ...]
    """

    MULTI_LINE_STRING = "MultiLineString"
    """A GeoJSON field storing a list of lines.

    The data is stored as follows::

        [
            [[lon1, lat1], [lon2, lat2], ...],
            [[lon1, lat1], [lon2, lat2], ...],
            ...
        ]
    """

    MULTI_POLYGON = "MultiPolygon"
    """A GeoJSON field storing a list of polygons.

    The data is stored as follows::

        [
            [
                [[lon1, lat1], [lon2, lat2], ...],
                [[lon1, lat1], [lon2, lat2], ...],
                ...
            ],
            [
                [[lon1, lat1], [lon2, lat2], ...],
                [[lon1, lat1], [lon2, lat2], ...],
                ...
            ],
            ...
        ]
    """


def dump_geo(value: t.Any, type: GeoType) -> t.Any:
    if isinstance(value, dict):
        return value

    return SON([("type", type), ("coordinates", value)])


def load_geo(value: t.Any) -> t.Any:
    if isinstance(value, dict):
        return value["coordinates"]

    return value


def vector_validator(value: t.Any) -> None:
    if isinstance(value, np.ndarray):
        if value.ndim > 1:
            raise ValueError("Only 1D arrays may be used in a vector field")
    elif not isinstance(value, (list, tuple, Binary)):
        raise ValueError(
            "Only numpy arrays, lists, and tuples may be used in a "
            "vector field"
        )


def array_validator(value: t.Any) -> None:
    if not isinstance(value, (np.ndarray, Binary)):
        raise ValueError("Only numpy arrays may be used in an array field")


def dump_array(value: t.Union[np.ndarray, Binary]) -> bytes:
    return fou.serialize_numpy_array(value)


def load_array(value: bytes) -> np.ndarray:
    return fou.deserialize_numpy_array(value)
