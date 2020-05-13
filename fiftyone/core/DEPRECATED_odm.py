"""
Object document mappers for the FiftyOne backend.

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

import json

from bson import json_util


class ODMMetadata(EmbeddedDocument):
    """Base class for storing metadata about raw data."""

    size_bytes = IntField()
    mime_type = StringField()

    meta = {"allow_inheritance": True}


class ODMImageMetadata(ODMMetadata):
    """Base class for storing metadata about raw images."""

    width = IntField()
    height = IntField()
    num_channels = IntField()


class ODMLabel(EmbeddedDocument):
    """Base class for documents that back :class:`fiftyone.core.labels.Label`
    instances.
    """

    meta = {"allow_inheritance": True}


class ODMImageLabel(ODMLabel):
    """Base class for documents that back
    :class:`fiftyone.core.labels.ImageLabel` instances.
    """

    pass


class ODMClassificationLabel(ODMImageLabel):
    """Backing document for :class:`fiftyone.core.labels.ClassificationLabel`
    instances.
    """

    label = StringField()
    confidence = FloatField(null=True)
    # @todo convert to a numeric array representation somehow?
    logits = ListField(FloatField(), null=True)


class ODMDetectionLabel(EmbeddedDocument):
    """Backing document for individual detections stored in
    :class:`fiftyone.core.labels.DetectionLabels`instances.
    """

    label = StringField()
    bounding_box = ListField(FloatField())
    confidence = FloatField(null=True)


class ODMDetectionLabels(ODMImageLabel):
    """Backing document for :class:`fiftyone.core.labels.DetectionLabels`
    instances.
    """

    detections = ListField(EmbeddedDocumentField(ODMDetectionLabel))


class ODMImageLabels(ODMImageLabel):
    """Backing document for :class:`fiftyone.core.labels.ImageLabels`
    instances.
    """

    labels = DictField()


class ODMInsight(EmbeddedDocument):
    """Base class for documents that back sample insights."""

    meta = {"allow_inheritance": True}


class ODMScalarInsight(ODMInsight):
    """Backing document for numerical scalar insights."""

    name = StringField()
    scalar = FloatField()


class ODMFileHashInsight(ODMInsight):
    """Backing document for file hash insights."""

    file_hash = IntField()


class ODMSample(ODMDocument):
    """Backing document for :class:`fiftyone.core.sample.Sample` instances."""

    dataset = StringField()
    filepath = StringField(unique=True)
    metadata = EmbeddedDocumentField(ODMMetadata, null=True)
    tags = ListField(StringField())
    insights = DictField(EmbeddedDocumentField(ODMInsight))
    labels = DictField(EmbeddedDocumentField(ODMLabel))

    # @todo(Tyler) replace the unique index on "filepath" with a unique on
    # "filepath" + "dataset"
    meta = {"allow_inheritance": True, "indexes": ["dataset", "filepath"]}


class ODMImageSample(ODMSample):
    """Backing document for :class:`fiftyone.core.sample.ImageSample`
    instances.
    """

    metadata = EmbeddedDocumentField(ODMImageMetadata, null=True)
