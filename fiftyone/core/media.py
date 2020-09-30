"""
Sample media utilities.

| Copyright 2017-2020, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""
import eta.core.image as etai
import eta.core.video as etav


# @todo deprecate in favor of MediaType?
VIDEO = "video"
IMAGE = "image"


class MediaType(object):
    """Media type enum.

    Attributes:
        IMAGE ("image"): image media
        VIDEO ("video"): video media
        OTHER ("-"): other media
    """

    IMAGE = "image"
    VIDEO = "video"
    OTHER = "-"


def validate_field_against_media_type(
    media_type, ftype, embedded_doc_type=None
):
    """Validates that a field is compliant with the given media type.

    Args:
        media_type: a :class:`MediaType` value
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

    if is_image_field and media_type != MediaType.IMAGE:
        if embedded_doc_type is not None:
            field_str = "%s(%s)" % (ftype.__name__, embedded_doc_type.__name__)
        else:
            field_str = ftype.__name__

        raise MediaTypeError(
            "Field %s is not compatible with media type '%s'"
            % (field_str, media_type)
        )


def get_media_type(filepath):
    """Gets the :class:`MediaType` for the given filepath.

    Args:
        filepath: a filepath

    Returns:
        a :class:`MediaType` value
    """
    # @todo use `etav.is_supported_video_file` instead?
    if etav.is_video_mime_type(filepath):
        return MediaType.VIDEO

    # @todo use `etai.is_supported_image` instead?
    if etai.is_image_mime_type(filepath):
        return MediaType.IMAGE

    return MediaType.OTHER


class MediaTypeError(TypeError):
    """Exception raised when a problem with media types is encountered."""

    pass
