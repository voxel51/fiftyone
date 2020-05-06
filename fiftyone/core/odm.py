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


DEFAULT_DATABASE = "fiftyone"


_db = connect(DEFAULT_DATABASE)


def drop_database():
    _db.drop_database(DEFAULT_DATABASE)


class ODMDocument(Document):
    meta = {"allow_inheritance": True}


class ODMMetadata(EmbeddedDocument):
    size_bytes = IntField()
    mime_type = StringField()

    meta = {"allow_inheritance": True}


class ODMImageMetadata(ODMMetadata):
    width = IntField()
    height = IntField()
    num_channels = IntField()


class ODMLabels(EmbeddedDocument):
    group = StringField()

    meta = {"allow_inheritance": True}


class ODMClassificationLabel(ODMLabels):
    label = StringField()
    confidence = FloatField()


class ODMInsight(EmbeddedDocument):
    group = StringField()

    meta = {"allow_inheritance": True}


class ODMFileHashInsight(ODMInsight):
    file_hash = StringField()


class ODMSample(ODMDocument):
    dataset = StringField()
    filepath = StringField(unique=True)
    metadata = EmbeddedDocumentField(ODMMetadata)
    tags = ListField(StringField())
    insights = ListField(EmbeddedDocumentField(ODMInsight))
    labels = ListField(EmbeddedDocumentField(ODMLabels))

    meta = {"allow_inheritance": True, "indexes": ["dataset", "filepath"]}


class ODMImageSample(ODMSample):
    metadata = EmbeddedDocumentField(ODMImageMetadata)
