"""
FiftyOne media discrimination utils.

| Copyright 2017-2020, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""
import eta.core.video as etav

import fiftyone.core.fields as fof
import fiftyone.core.labels as fol


def validate_field_against_mtype(mtype, ftype, embedded_doc_type=None):
    is_image_field = is_video_field = False

    if issubclass(ftype, fof.ImageLabelsField):
        is_image_field = True

    if embedded_doc_type is not None and issubclass(
        embedded_doc_type, fol.ImageLabel
    ):
        image_field = True

    if issubclass(ftype, fof.VideoLabelsField):
        is_video_field = True

    if is_image_field and mtype != "image":
        raise MediaTypeError("Cannot add image based field")
    elif is_video_field and mtype != "video":
        raise MediaTypeError("Cannot add video based field")


def get_media_type(filepath):
    if etav.is_supported_video_file(filepath):
        return "video"

    return "image"


class MediaTypeError(TypeError):

    pass
