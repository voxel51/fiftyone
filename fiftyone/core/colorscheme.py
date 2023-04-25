"""
Color Scheme configuration.

| Copyright 2017-2023, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""
from mongoengine.errors import ValidationError
from fiftyone.constants import DEFAULT_APP_COLOR_POOL
import fiftyone.core.dataset as fod
import fiftyone.core.fields as fof
from bson import json_util, ObjectId
import eta.core.serial as etas


class ColorScheme:
    """Configuration of a color scheme.

    Args:
        color_pool: a list of colors
        customized_color_settings: a list of dicts mapping customoized color settings, which can includes properties such as field, use_field_color, field_color, use_label_colors, label_colors
    """

    def __init__(self, color_pool=None, customized_color_settings=[]):
        self.color_pool = color_pool or DEFAULT_APP_COLOR_POOL
        self.customized_color_settings = customized_color_settings

    # def to_json(self, pretty_print=False):
    #     """Serializes the document to a JSON string.

    #     Args:
    #         pretty_print (False): whether to render the JSON in human readable
    #             format with newlines and indentations

    #     Returns:
    #         a JSON string
    #     """
    #     if not pretty_print:
    # return json_util.dumps(self.to_dict())

    # d = self.to_dict(extended=True)
    # return etas.json_to_str(d, pretty_print=pretty_print)
    # return
