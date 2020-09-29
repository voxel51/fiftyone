"""
FiftyOne media discrimination utils.

| Copyright 2017-2020, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""
import eta.core.video as etav


def validate_field_against_media_type(
    media_type, ftype, embedded_doc_type=None
):
    # temporary method imports
    import fiftyone.core.fields as fof
    import fiftyone.core.labels as fol

    is_image_field = False

    if issubclass(ftype, fof.ImageLabelsField):
        is_image_field = True

    if embedded_doc_type is not None and issubclass(
        embedded_doc_type, fol.ImageLabel
    ):
        image_field = True

    if is_image_field and media_type != "image":
        raise MediaTypeError("Cannot add image based field")


def get_media_type(filepath):
    if etav.is_supported_video_file(filepath):
        return "video"

    return "image"


class MediaTypeError(TypeError):

    pass
