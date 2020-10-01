"""
Sample media utilities.

| Copyright 2017-2020, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""
import eta.core.image as etai
import eta.core.video as etav


# Valid media types
# @todo convert to a MediaType enum class?
VIDEO = "video"
IMAGE = "image"
MEDIA_TYPES = {IMAGE, VIDEO}


def validate_field_against_media_type(
    media_type, ftype, embedded_doc_type=None
):
    """Validates that a field is compliant with the given media type.

    Args:
        media_type: a media type
        ftype: the field type. Must be a subclass of
            :class:`fiftyone.core.fields.Field`
        embedded_doc_type (None): the
            :class:`fiftyone.core.odm.BaseEmbeddedDocument` type of the
            field. Used only when ``ftype`` is an embedded
            :class:`fiftyone.core.fields.EmbeddedDocumentField`

    Raises:
        :class:`MediaTypeError` if the field is not compliant with the media
        type
    """
    # @todo avoid circular dependency
    import fiftyone.core.fields as fof
    import fiftyone.core.labels as fol

    is_image_field = False

    if issubclass(ftype, fof.ImageLabelsField):
        is_image_field = True

    if embedded_doc_type is not None and issubclass(
        embedded_doc_type, fol.ImageLabel
    ):
        is_image_field = True

    if is_image_field and media_type != IMAGE:
        if embedded_doc_type is not None:
            field_str = "%s(%s)" % (ftype.__name__, embedded_doc_type.__name__)
        else:
            field_str = ftype.__name__

        raise MediaTypeError(
            "Field %s is not compatible with media type '%s'"
            % (field_str, media_type)
        )


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
