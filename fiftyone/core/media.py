"""
Sample media utilities.

| Copyright 2017-2022, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""
import eta.core.video as etav


# Valid media types
VIDEO = "video"
IMAGE = "image"
POINT_CLOUD = "point-cloud"
GROUP = "group"
MEDIA_TYPES = {IMAGE, VIDEO, POINT_CLOUD, GROUP}


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

    return IMAGE


class MediaTypeError(TypeError):
    """Exception raised when a problem with media types is encountered."""

    pass
