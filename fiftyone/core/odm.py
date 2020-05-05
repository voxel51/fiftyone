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

class ODMDocument(Document):
    """Renaming Document"""
    meta = {"allow_inheritance": True}

def drop_database():
    _db.drop_database(DEFAULT_DATABASE)


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
