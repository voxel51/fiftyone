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

from copy import deepcopy
import json

from bson import json_util

# pylint: disable=wildcard-import,unused-wildcard-import
from mongoengine import *


_DEFAULT_DATABASE = "fiftyone"


_db = connect(_DEFAULT_DATABASE)


def drop_database():
    """Drops the database."""
    _db.drop_database(_DEFAULT_DATABASE)


class ODMDocument(Document):
    """Base class for documents backing
    :class:`fiftyone.core.document.BackedByDocument` classes.
    """

    meta = {"allow_inheritance": True}

    def __str__(self):
        return str(
            json.dumps(
                self.to_dict(extended=True),
                separators=(",", ": "),
                ensure_ascii=False,
                indent=4,
            )
        )

    def __copy__(self):
        return self.copy()

    def copy(self):
        """Returns a copy of the document that does not have its `id` set.

        Returns:
            a :class:`ODMDocument`
        """
        doc = deepcopy(self)
        doc.id = None
        return doc

    def to_dict(self, extended=False):
        """Serializes this document to a JSON dictionary.

        Args:
            extended (False): whether to return extended JSON, i.e.,
                ObjectIDs, Datetimes, etc. are serialized

        Returns:
            a JSON dict
        """
        if extended:
            return json.loads(self.to_json())

        return json_util.loads(self.to_json())

    @classmethod
    def from_dict(cls, d, created=False, extended=False):
        """Loads the document from a JSON dictionary.

        Args:
            d: a JSON dictionary
            created (False): whether to consider the newly instantiated
                document as brand new or as persisted already. The following
                cases exist:

                    * If ``True``, consider the document as brand new, no
                      matter what data it is loaded with (i.e., even if an ID
                      is loaded)

                    * If ``False`` and an ID is NOT provided, consider the
                      document as brand new

                    * If ``False`` and an ID is provided, assume that the
                      object has already been persisted (this has an impact on
                      the subsequent call to ``.save()``)

            extended (False): if ``False``, ObjectIDs, Datetimes, etc. are
                expected to already be loaded

        Returns:
            a :class:`ODMDocument`
        """
        if not extended:
            try:
                # Attempt to load the document directly, assuming it is in
                # extended form
                return cls._from_son(d, created=created)
            except Exception:
                pass

        return cls.from_json(json_util.dumps(d), created=created)


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
