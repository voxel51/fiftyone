"""
Core Module for `fiftyone` Sample class

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
from mongoengine import *

DEFAULT_DATABASE = "fiftyone"

_db = connect(DEFAULT_DATABASE)


def drop_database():
    _db.drop_database(DEFAULT_DATABASE)


class Metadata(EmbeddedDocument):
    meta = {"allow_inheritance": True}

    size_bytes = IntField(required=True)
    mime_type = StringField(required=True)


class ImageMetadata(Metadata):
    width = IntField(required=True)
    height = IntField(required=True)
    num_channels = IntField(required=True)


class Labels(EmbeddedDocument):
    meta = {"allow_inheritance": True}


class Insight(EmbeddedDocument):
    meta = {"allow_inheritance": True}


class Sample(Document):
    meta = {"allow_inheritance": True}

    dataset = StringField(required=True)
    filepath = StringField(required=True, unique=True)
    metadata = EmbeddedDocumentField(Metadata)
    tags = ListField(StringField())
    insights = ListField(EmbeddedDocumentField(Insight))
    labels = ListField(EmbeddedDocumentField(Labels))


class ImageSample(Sample):
    metadata = EmbeddedDocumentField(ImageMetadata)
