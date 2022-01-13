"""
Sample media utilities.

| Copyright 2017-2022, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""
import eta.core.video as etav


# Valid media types
# @todo convert to a MediaType enum class?
VIDEO = "video"
IMAGE = "image"
MEDIA_TYPES = {IMAGE, VIDEO}


def get_media_type(filepath):
    """Gets the media type for the given filepath.

    Args:
        filepath: a filepath

    Returns:
        the media type
    """
    # @todo use `etav.is_supported_video_file` instead?
    if etav.is_video_mime_type(filepath):
        return VIDEO

    # @todo don't assume all non-video samples are images!
    return IMAGE


class MediaTypeError(TypeError):
    """Exception raised when a problem with media types is encountered."""

    pass
