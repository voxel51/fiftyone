"""
Labels stored in dataset samples.

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
from future.utils import iteritems, itervalues

# pragma pylint: enable=redefined-builtin
# pragma pylint: enable=unused-wildcard-import
# pragma pylint: enable=wildcard-import

# pylint: disable=wildcard-import,unused-wildcard-import

from mongoengine import (
    FloatField,
    StringField,
    ListField,
    DictField,
    EmbeddedDocumentField,
)

import eta.core.data as etad
import eta.core.geometry as etag
import eta.core.image as etai
import eta.core.objects as etao

from fiftyone.core.odm.document import ODMEmbeddedDocument


class Label(ODMEmbeddedDocument):
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

    Args:
        label: the label string
        confidence (None): a confidence in ``[0, 1]`` for the label
        logits (None): logits associated with the labels
    """

    meta = {"allow_inheritance": True}

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


class Detection(ODMEmbeddedDocument):
    """Backing document for individual detections stored in
    :class:`fiftyone.core.labels.DetectionLabels`instances.

    Args:
        label: the label string
        bounding_box: a list of relative bounding box coordinates in ``[0, 1]``

            [ <top-left-x>, <top-right-y>, <width>, <height> ]

        confidence (None): a confidence in ``[0, 1]`` for the label
    """

    meta = {"allow_inheritance": True}

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

    meta = {"allow_inheritance": True}

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

    meta = {"allow_inheritance": True}

    labels = DictField()

    def to_image_labels(self):
        """Returns an ``eta.core.image.ImageLabels`` representation of this
        instance.

        Returns:
            an ``eta.core.image.ImageLabels`` instance
        """
        return etai.ImageLabels.from_dict(self.labels)
