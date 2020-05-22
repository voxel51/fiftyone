"""
Metadata stored in dataset samples.

| Copyright 2017-2020, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""
# pragma pylint: disable=redefined-builtin
# pragma pylint: disable=unused-wildcard-import
# pragma pylint: disable=wildcard-import
from __future__ import absolute_import
from __future__ import division
from __future__ import print_function
from __future__ import unicode_literals
from builtins import *
from future.utils import iteritems, itervalues

# pragma pylint: enable=redefined-builtin
# pragma pylint: enable=unused-wildcard-import
# pragma pylint: enable=wildcard-import

# pylint: disable=wildcard-import,unused-wildcard-import

from fiftyone.core.odm.document import ODMEmbeddedDocument
import fiftyone.core.field as fof


class Metadata(ODMEmbeddedDocument):
    """Base class for storing metadata about raw data.

    Args:
        size_bytes: integer size of the media in bytes
        mime_type: the MIME type of the media
    """

    meta = {"allow_inheritance": True}

    size_bytes = fof.IntField()
    mime_type = fof.StringField()


class ImageMetadata(Metadata):
    """Base class for storing metadata about raw images.

    Args:
        width: integer width of the image in pixels
        height: integer height of the image in pixels
        num_channels: integer number of channels of the image
    """

    width = fof.IntField()
    height = fof.IntField()
    num_channels = fof.IntField()
