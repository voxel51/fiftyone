import cv2
from PIL import Image
import numpy as np

import fiftyone as fo
import fiftyone.operators.types as types


###
# FiftyOne Utility Functions
###


def _handle_patch_inputs(ctx, inputs):
    target_view = ctx.target_view()
    patch_types = (fo.Detection, fo.Detections, fo.Polyline, fo.Polylines)
    patches_fields = list(
        target_view.get_field_schema(embedded_doc_type=patch_types).keys()
    )

    if patches_fields:
        patches_field_choices = types.DropdownView()
        for field in sorted(patches_fields):
            patches_field_choices.add_choice(field, label=field)

        inputs.str(
            "patches_field",
            default=None,
            required=False,
            label="Patches Field",
            description=(
                "An optional sample field defining image patches in each "
                "sample to run the computation on. If omitted, the full images "
                "will be used."
            ),
            view=patches_field_choices,
        )


###
# General Utility Functions
###


def get_filepath(sample):
    return (
        sample.local_path if hasattr(sample, "local_path") else sample.filepath
    )


def _crop_pillow_image(pillow_img, detection):
    img_w, img_h = pillow_img.width, pillow_img.height

    bounding_box = detection.bounding_box
    left, top, width, height = bounding_box
    left *= img_w
    top *= img_h
    right = left + width * img_w
    bottom = top + height * img_h

    return pillow_img.crop((left, top, right, bottom))


def _get_pillow_patch(sample, detection):
    img = Image.open(get_filepath(sample))
    return _crop_pillow_image(img, detection)


def _convert_pillow_to_opencv(pillow_img):
    # pylint: disable=no-member
    return cv2.cvtColor(np.array(pillow_img), cv2.COLOR_RGB2BGR)


def _convert_opencv_to_pillow(opencv_image):
    # pylint: disable=no-member
    return Image.fromarray(cv2.cvtColor(opencv_image, cv2.COLOR_BGR2RGB))


def _get_opencv_grayscale_image(sample):
    # pylint: disable=no-member
    return cv2.imread(get_filepath(sample), cv2.IMREAD_GRAYSCALE)
