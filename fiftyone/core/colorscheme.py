"""
Color Scheme configuration.

| Copyright 2017-2023, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""
from fiftyone.constants import DEFAULT_APP_COLOR_POOL
import fiftyone.core.fields as fof
from fiftyone.core.odm import EmbeddedDocument


class ColorScheme(EmbeddedDocument):
    """Description of a color scheme in the App.
    Args:
        color_pool: a list of string representing colors for the color pool
        customized_color_settings: a list of dicts mapping customoized color settings,
        which can include properties such as field, useFieldColor, fieldColor,
        attributeForColor, labelColors
    """

    # strict=False lets this class ignore unknown fields from other versions
    meta = {"strict": False}
    color_pool = fof.ListField(fof.StringField(), default=[])
    customized_color_settings = fof.ListField(fof.DictField(), default=[])


default_color_scheme = ColorScheme(
    color_pool=DEFAULT_APP_COLOR_POOL, customized_color_settings=[]
)
