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

import eta.core.data as etad
import eta.core.geometry as etag
import eta.core.image as etai
import eta.core.objects as etao

import fiftyone.core.document as fod
import fiftyone.core.odm as foo


class Label(fod.BackedByDocument):
    """A label for a :class:`fiftyone.core.sample.Sample` in a
    :class:`fiftyone.core.dataset.Dataset`.

    Label instances represent an atomic collection of labels associated with a
    sample in a dataset. Label instances may represent concrete tasks such as
    image classification (:class:`ClassificationLabel`) or image object
    detection (:class:`DetectionLabels`), or they may represent higher-level
    constructs such as a collection of labels for a particular sample
    (:class:`ImageLabels`).
    """

    _ODM_DOCUMENT_CLS = foo.ODMLabel

    @classmethod
    def create(cls):
        """Creates a :class:`Label` instance."""
        return cls._create()

    @classmethod
    def from_doc(cls, document):
        """Creates an instance of the :class:`fiftyone.core.label.Label` class
        backed by the given document.

        Args:
            document: an :class:`fiftyone.core.odm.ODMLabel` instance
        """
        label_cls = _LABEL_CLS_MAP[document.__class__]
        return label_cls(document)


class ImageLabel(Label):
    """A label for an :class:`fiftyone.core.sample.ImageSample` in a
    :class:`fiftyone.core.dataset.Dataset`.
    """

    _ODM_DOCUMENT_CLS = foo.ODMImageLabel

    def to_image_labels(self):
        """Returns an ``eta.core.image.ImageLabels`` representation of this
        instance.

        Returns:
            an ``eta.core.image.ImageLabels`` instance
        """
        raise NotImplementedError("Subclass must implement to_image_labels()")


class ClassificationLabel(ImageLabel):
    """A classification label for an :class:`fiftyone.core.sample.ImageSample`
    in a :class:`fiftyone.core.dataset.Dataset`.

    See :class:`fiftyone.utils.data.ImageClassificationSampleParser` for a
    convenient way to build labels of this type for your existing datasets.
    """

    _ODM_DOCUMENT_CLS = foo.ODMClassificationLabel

    @property
    def label(self):
        """The label string."""
        return self._backing_doc.label

    @property
    def confidence(self):
        """The classification confidence, or ``None`` if it does not exist."""
        return self._backing_doc.confidence

    @property
    def logits(self):
        """The logits associated with the prediction, or ``None`` if they do
        not exist.
        """
        return self._backing_doc.logits

    @classmethod
    def create(cls, label, confidence=None, logits=None):
        """Creates a :class:`ClassificationLabel` instance.

        Args:
            label: the label string
            confidence (None): a confidence in ``[0, 1]`` for the label
            logits (None): logits associated with the labels

        Returns:
            a :class:`ClassificationLabel`
        """
        return cls._create(label=label, confidence=confidence, logits=logits,)

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


class DetectionLabels(ImageLabel):
    """A set of object detections for an
    :class:`fiftyone.core.sample.ImageSample` in a
    :class:`fiftyone.core.dataset.Dataset`.

    See :class:`fiftyone.utils.data.ImageDetectionSampleParser` for a
    convenient way to build labels of this type for your existing datasets.
    """

    _ODM_DOCUMENT_CLS = foo.ODMDetectionLabels

    @property
    def detections(self):
        """The object detections."""
        return self._backing_doc.detections

    @classmethod
    def create(cls, detections):
        """Creates a :class:`DetectionLabels` instance.

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

        Returns:
            a :class:`DetectionLabels`
        """
        return cls._create(detections=detections)

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
    """A collection of multitask labels for an
    :class:`fiftyone.core.sample.ImageSample` in a
    :class:`fiftyone.core.dataset.Dataset`.

    See :class:`fiftyone.utils.data.ImageLabelsSampleParser` for a
    convenient way to build labels of this type for your existing datasets.
    """

    _ODM_DOCUMENT_CLS = foo.ODMImageLabel

    @property
    def labels(self):
        """The ``eta.core.image.ImageLabels``."""
        return etai.ImageLabels.from_dict(self._backing_doc.labels)

    @classmethod
    def create(cls, labels):
        """Creates an :class:`ImageLabels` instance.

        Args:
            labels: an ``eta.core.image.ImageLabels`` or a serialized dict
                representation of one

        Returns:
            a :class:`ImageLabels`
        """
        if isinstance(labels, etai.ImageLabels):
            labels = labels.serialize()

        return cls._create(labels=labels)

    def to_image_labels(self):
        """Returns an ``eta.core.image.ImageLabels`` representation of this
        instance.

        Returns:
            an ``eta.core.image.ImageLabels`` instance
        """
        return self.labels.copy()


_LABEL_CLS_MAP = {
    foo.ODMLabel: Label,
    foo.ODMClassificationLabel: ClassificationLabel,
    foo.ODMDetectionLabels: DetectionLabels,
    foo.ODMImageLabel: ImageLabels,
}
