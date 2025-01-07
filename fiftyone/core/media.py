"""
Sample media utilities.

| Copyright 2017-2025, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""
import eta.core.video as etav


# Valid media types
VIDEO = "video"
IMAGE = "image"
POINT_CLOUD = "point-cloud"
THREE_D = "3d"
MEDIA_TYPES = {IMAGE, VIDEO, POINT_CLOUD, THREE_D}

# Special media types
GROUP = "group"
MIXED = "mixed"


def get_media_type(filepath):
    """Gets the media type for the given filepath.

    Args:
        filepath: a filepath

    Returns:
        the media type
    """
    if etav.is_video_mime_type(filepath):
        return VIDEO

    if filepath.endswith(".pcd"):
        return POINT_CLOUD

    if filepath.endswith(".fo3d"):
        return THREE_D

    return IMAGE


class MediaTypeError(TypeError):
    """Exception raised when a problem with media types is encountered."""

    pass


class SelectGroupSlicesError(ValueError):
    """Exception raised when a grouped collection is passed to a method that
    expects a primitive media type to be selected.

    Args:
        supported_media_types (None): an optional media type or iterable of
            media types that are supported
    """

    def __init__(self, supported_media_types=None):
        if isinstance(supported_media_types, str):
            type_str = supported_media_types + " "
        elif supported_media_types is not None:
            type_str = "/".join(supported_media_types) + " "
        else:
            type_str = ""

        message = (
            "This method does not directly support grouped collections. "
            "You must use `select_group_slices()` to select %sslice(s) to "
            "process"
        ) % type_str

        super().__init__(message)
