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

# pylint: disable=wildcard-import,unused-wildcard-import
from mongoengine import *


_DEFAULT_DATABASE = "fiftyone"


_db = connect(_DEFAULT_DATABASE)


def drop_database():
    """Drops the entire database."""
    _db.drop_database(_DEFAULT_DATABASE)


class ODMDocument(Document):
    """Base class for documents backing
    :class:`fiftyone.core.document.BackedByDocument` classes.
    """

    meta = {"allow_inheritance": True}


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

    group = StringField()
    meta = {"allow_inheritance": True}


class ODMImageLabel(ODMLabel):
    """Base class for documents that back
    :class:`fiftyone.core.labels.ImageLabel` instances.
    """

    meta = {"allow_inheritance": True}


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

    group = StringField()
    meta = {"allow_inheritance": True}


class ODMFileHashInsight(ODMInsight):
    """Backing document for file hash insights."""

    file_hash = StringField()


class ODMSample(ODMDocument):
    """Backing document for :class:`fiftyone.core.sample.Sample` instances."""

    dataset = StringField()
    filepath = StringField(unique=True)
    metadata = EmbeddedDocumentField(ODMMetadata)
    tags = ListField(StringField())
    insights = ListField(EmbeddedDocumentField(ODMInsight))
    labels = ListField(EmbeddedDocumentField(ODMLabel))
    meta = {"allow_inheritance": True, "indexes": ["dataset", "filepath"]}


class ODMImageSample(ODMSample):
    """Backing document for :class:`fiftyone.core.sample.ImageSample`
    instances.
    """

    metadata = EmbeddedDocumentField(ODMImageMetadata)
