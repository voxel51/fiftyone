"""
Utilities for working with `Rerun <https://rerun.io/>`_.

| Copyright 2017-2024, Voxel51, Inc.
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
        version (0.18.2): the version of the rrd file. Since rrd files do not
            yet guarantee backwards compatibility, this field is used to
            determine how to parse the file and what rerun viewer to use.
            If not provided, the default version is 0.18.2
    """

    _MEDIA_FIELD = "filepath"

    filepath = fof.StringField()
    version = fof.StringField(default="0.18.2")
