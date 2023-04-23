"""
Color Scheme configuration.

| Copyright 2017-2023, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""
from bson import ObjectId
from mongoengine.errors import ValidationError
import uuid
from fiftyone.constants import DEFAULT_APP_COLOR_POOL
import fiftyone.core.dataset as fod

import fiftyone.core.fields as fof


class ColorScheme:
    """Configuration of a color scheme.

    Args:
        colors: a list of colors
    """

    def __init__(self, color_pool=None, customized_colors_settings=None):
        self.color_pool = color_pool or DEFAULT_APP_COLOR_POOL
        self.customized_colors_settings = customized_colors_settings
        # if color_pool is None or len(color_pool) == 0:
        #     # load from dataset.app_config
        #     # if not exist, use default app color pool
        #     self.color_pool = DEFAULT_APP_COLOR_POOL
        # else:
        #     self.color_pool = color_pool
