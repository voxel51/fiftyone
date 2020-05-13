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

import json

from bson import json_util
from mongoengine import *


class SerializableDocumentMixin(object):
    meta = {"abstract": True}

    def __str__(self):
        return str(
            json.dumps(
                self.to_dict(extended=True),
                separators=(",", ": "),
                ensure_ascii=False,
                indent=4,
            )
        )

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


class Metadata(SerializableDocumentMixin, EmbeddedDocument):
    """Base class for storing metadata about raw data."""

    size_bytes = IntField()
    mime_type = StringField()

    meta = {"allow_inheritance": True}


class ImageMetadata(Metadata):
    """Base class for storing metadata about raw images."""

    width = IntField()
    height = IntField()
    num_channels = IntField()


class Label(SerializableDocumentMixin, EmbeddedDocument):
    """Base class for documents that back :class:`fiftyone.core.labels.Label`
    instances.
    """

    meta = {"allow_inheritance": True}


class ImageLabel(Label):
    """Base class for documents that back
    :class:`fiftyone.core.labels.ImageLabel` instances.
    """

    meta = {"allow_inheritance": True}


class Classification(ImageLabel):
    """Backing document for :class:`fiftyone.core.labels.ClassificationLabel`
    instances.
    """

    label = StringField()
    confidence = FloatField(null=True)
    # @todo convert to a numeric array representation somehow?
    logits = ListField(FloatField(), null=True)


class Detection(SerializableDocumentMixin, EmbeddedDocument):
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
