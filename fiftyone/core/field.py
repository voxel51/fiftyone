"""

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
from mongoengine import *


class Metadata(EmbeddedDocument):
    """Base class for storing metadata about raw data."""

    size_bytes = IntField()
    mime_type = StringField()

    meta = {"allow_inheritance": True}


class ImageMetadata(Metadata):
    """Base class for storing metadata about raw images."""

    width = IntField()
    height = IntField()
    num_channels = IntField()


class Label(EmbeddedDocument):
    """Base class for documents that back :class:`fiftyone.core.labels.Label`
    instances.
    """

    meta = {"allow_inheritance": True}


class ImageLabel(Label):
    """Base class for documents that back
    :class:`fiftyone.core.labels.ImageLabel` instances.
    """

    pass


class Classification(ImageLabel):
    """Backing document for :class:`fiftyone.core.labels.ClassificationLabel`
    instances.
    """

    label = StringField()
    confidence = FloatField(null=True)
    # @todo convert to a numeric array representation somehow?
    logits = ListField(FloatField(), null=True)


class Detection(EmbeddedDocument):
    """Backing document for individual detections stored in
    :class:`fiftyone.core.labels.DetectionLabels`instances.
    """

    label = StringField()
    bounding_box = ListField(FloatField())
    confidence = FloatField(null=True)


class Detections(ImageLabel):
    """Backing document for :class:`fiftyone.core.labels.DetectionLabels`
    instances.
    """

    detections = ListField(EmbeddedDocumentField(Detection))


class ImageLabels(ImageLabel):
    """Backing document for :class:`fiftyone.core.labels.ImageLabels`
    instances.
    """

    labels = DictField()
