"""
Utilities for working with Gaussian Splats.

| Copyright 2017-2024, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""

import fiftyone.core.fields as fof
import fiftyone.core.labels as fol
from fiftyone.core.odm import DynamicEmbeddedDocument


class SplatFile(DynamicEmbeddedDocument, fol._HasMedia):
    """Class for storing a Gaussian Splat data (splat) file and its associated metadata.

    Args:
        filepath (None): the path to the splat file
        version (None): the version of the splat file
    """

    _MEDIA_FIELD = "filepath"

    filepath = fof.StringField()
    version = fof.StringField()
