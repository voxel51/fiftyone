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


class ColorScheme:
    """Configuration of a color scheme.

    Args:
        colors: a list of colors
    """

    def __init__(self, color_pool=None, customized_color_settings=None):
        self.color_pool = color_pool or DEFAULT_APP_COLOR_POOL
        self.customized_color_settings = customized_color_settings
