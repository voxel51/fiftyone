"""
Utilities for working with `Rerun <https://rerun.io/>`_.

| Copyright 2017-2025, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""

import fiftyone.core.fields as fof
import fiftyone.core.labels as fol
from fiftyone.core.odm import DynamicEmbeddedDocument


class RrdFile(DynamicEmbeddedDocument, fol._HasMedia):
    """Class for storing a rerun data (rrd) file and its associated metadata.

    Args:
        filepath (None): the path to the rrd file
        version (None): the version of the rrd file
    """

    _MEDIA_FIELD = "filepath"

    filepath = fof.StringField()
    version = fof.StringField()
