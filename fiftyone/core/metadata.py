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

# pragma pylint: enable=redefined-builtin
# pragma pylint: enable=unused-wildcard-import
# pragma pylint: enable=wildcard-import

import eta.core.image as etai

from fiftyone.core.odm.document import ODMEmbeddedDocument
import fiftyone.core.fields as fof


class Metadata(ODMEmbeddedDocument):
    """Base class for storing metadata about sample data.

    Args:
        size_bytes: integer size of the media in bytes
        mime_type: the MIME type of the media
    """

    meta = {"allow_inheritance": True}

    size_bytes = fof.IntField()
    mime_type = fof.StringField()


class ImageMetadata(Metadata):
    """Class for storing metadata about images in samples.

    Args:
        width: integer width of the image in pixels
        height: integer height of the image in pixels
        num_channels: integer number of channels of the image
    """

    width = fof.IntField()
    height = fof.IntField()
    num_channels = fof.IntField()

    @classmethod
    def build_for(cls, filepath):
        """Builds an :class:`ImageMetadata` object for the given image.

        Args:
            filepath: the path to the image on disk

        Returns:
            an :class:`ImageMetadata`
        """
        m = etai.ImageMetadata.build_for(filepath)
        return cls(
            size_bytes=m.size_bytes,
            mime_type=m.mime_type,
            width=m.frame_size[0],
            height=m.frame_size[1],
            num_channels=m.num_channels,
        )
