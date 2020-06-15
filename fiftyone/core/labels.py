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

# pragma pylint: enable=redefined-builtin
# pragma pylint: enable=unused-wildcard-import
# pragma pylint: enable=wildcard-import

import eta.core.data as etad
import eta.core.geometry as etag
import eta.core.image as etai
import eta.core.objects as etao

from fiftyone.core.odm.document import ODMEmbeddedDocument
import fiftyone.core.fields as fof


class Label(ODMEmbeddedDocument):
    """A label for a sample in a :class:`fiftyone.core.dataset.Dataset`.

    Label instances represent an atomic collection of labels associated with a
    sample in a dataset. Label instances may represent concrete tasks such as
    image classification (:class:`Classification`) or image object detection
    (:class:`Detections`), or they may represent higher-level constructs such
    as a collection of labels for a particular sample (:class:`ImageLabels`).
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

    label = fof.StringField()
    confidence = fof.FloatField()
    logits = fof.VectorField()

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
    :class:`fiftyone.core.labels.Detections`instances.

    Args:
        label: the label string
        bounding_box: a list of relative bounding box coordinates in ``[0, 1]``
            in the following format::

            [<top-left-x>, <top-right-y>, <width>, <height>]

        confidence (None): a confidence in ``[0, 1]`` for the label
    """

    meta = {"allow_inheritance": True}

    label = fof.StringField()
    bounding_box = fof.VectorField()
    confidence = fof.ListField(fof.FloatField())


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

    detections = fof.ListField(fof.EmbeddedDocumentField(Detection))

    def to_image_labels(self):
        """Returns an ``eta.core.image.ImageLabels`` representation of this
        instance.

        Returns:
            an ``eta.core.image.ImageLabels`` instance
        """
        # pylint: disable=not-an-iterable
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

    Args:
        labels: an ``eta.core.image.ImageLabels`` instance or a serialized
            dict representation of one
    """

    meta = {"allow_inheritance": True}

    labels = fof.ImageLabelsField()

    def to_image_labels(self):
        """Returns an ``eta.core.image.ImageLabels`` representation of this
        instance.

        Returns:
            an ``eta.core.image.ImageLabels`` instance
        """
        return self.labels
