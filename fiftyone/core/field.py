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

import eta.core.data as etad
import eta.core.geometry as etag
import eta.core.image as etai
import eta.core.objects as etao


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
    """A label for a sample in a :class:`fiftyone.core.dataset.Dataset`.

    Label instances represent an atomic collection of labels associated with a
    sample in a dataset. Label instances may represent concrete tasks such as
    image classification (:class:`ClassificationLabel`) or image object
    detection (:class:`DetectionLabels`), or they may represent higher-level
    constructs such as a collection of labels for a particular sample
    (:class:`ImageLabels`).
    """

    meta = {"allow_inheritance": True}


class ImageLabel(Label):
    """A label for an image sample in a :class:`fiftyone.core.dataset.Dataset`.
    """

    meta = {"allow_inheritance": True}

    def to_image_labels(self):
        """Returns an ``eta.core.image.ImageLabels`` representation of this
        instance.

        Returns:
            an ``eta.core.image.ImageLabels`` instance
        """
        raise NotImplementedError("Subclass must implement to_image_labels()")


class Classification(ImageLabel):
    """A classification label for an image sample in a
    :class:`fiftyone.core.dataset.Dataset`.

    See :class:`fiftyone.utils.data.ImageClassificationSampleParser` for a
    convenient way to build labels of this type for your existing datasets.
    """

    label = StringField()
    confidence = FloatField(null=True)
    # @todo convert to a numeric array representation somehow?
    logits = ListField(FloatField(), null=True)

    def to_image_labels(self, attr_name="label"):
        """Returns an ``eta.core.image.ImageLabels`` representation of this
        instance.

        Args:
            attr_name ("label"): an optional frame attribute name to use

        Returns:
            an ``eta.core.image.ImageLabels`` instance
        """
        image_labels = etai.ImageLabels()
        image_labels.add_attribute(
            etad.CategoricalAttribute(
                attr_name, self.label, confidence=self.confidence
            )
        )
        return image_labels


class Detection(SerializableDocumentMixin, EmbeddedDocument):
    """Backing document for individual detections stored in
    :class:`fiftyone.core.labels.DetectionLabels`instances.
    """

    label = StringField()
    bounding_box = ListField(FloatField())
    confidence = FloatField(null=True)


class Detections(ImageLabel):
    """A set of object detections for an image sample in a
    :class:`fiftyone.core.dataset.Dataset`.

    See :class:`fiftyone.utils.data.ImageDetectionSampleParser` for a
    convenient way to build labels of this type for your existing datasets.

    Args:
        detections: a list of detection dicts of the following form::

            [
                {
                    "label": <label>,
                    "bounding_box": [
                        <top-left-x>, <top-right-y>, <width>, <height>
                    ],
                    "confidence": <optional-confidence>,
                    ...
                },
                ...
            ]

            where ``label`` is a label string, the bounding box coordinates
            are expressed as relative values in ``[0, 1]``, and
            ``confidence`` is an optional confidence ``[0, 1]`` for the
            label
    """

    detections = ListField(EmbeddedDocumentField(Detection))

    def to_image_labels(self):
        """Returns an ``eta.core.image.ImageLabels`` representation of this
        instance.

        Returns:
            an ``eta.core.image.ImageLabels`` instance
        """
        image_labels = etai.ImageLabels()

        for detection in self.detections:
            tlx, tly, w, h = detection.bounding_box
            brx = tlx + w
            bry = tly + h
            bounding_box = etag.BoundingBox.from_coords(tlx, tly, brx, bry)

            image_labels.add_object(
                etao.DetectedObject(
                    label=detection.label,
                    bounding_box=bounding_box,
                    confidence=detection.confidence,
                )
            )

        return image_labels


class ImageLabels(ImageLabel):
    """A collection of multitask labels for an image sample in a
    :class:`fiftyone.core.dataset.Dataset`.

    See :class:`fiftyone.utils.data.ImageLabelsSampleParser` for a
    convenient way to build labels of this type for your existing datasets.
    """

    labels = DictField()

    def to_image_labels(self):
        """Returns an ``eta.core.image.ImageLabels`` representation of this
        instance.

        Returns:
            an ``eta.core.image.ImageLabels`` instance
        """
        return etai.ImageLabels.from_dict(self.labels)
