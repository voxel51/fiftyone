"""
Core definitions of labels stored in FiftyOne dataset samples.

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

import eta.core.image as etai

import fiftyone.core.document as fod
import fiftyone.core.odm as foo


class Label(fod.BackedByDocument):
    """A label for a sample in a :class:`fiftyone.core.dataset.Dataset`.

    Label instances represent an atomic group of labels associated with a
    sample in a dataset. Label instances may represent concrete tasks such as
    image classification (:class:`ClassificationLabel`) or image object
    detection (:class:`DetectionLabels`), or they may represent higher-level
    constructs such as a collection of labels for a particular sample
    (:class:`ImageLabels`).

    Args:
        group: the group name of the label
    """

    _ODM_DOCUMENT_CLS = foo.ODMLabels

    @property
    def group(self):
        """The group name of the label."""
        return self._backing_doc.group

    @classmethod
    def create_new(cls, group):
        """Creates a new :class:`Label`.

        Args:
            group: the group name of the label
        """
        return cls._create_new(group=group)


class ClassificationLabel(Label):
    """A classification label for an image sample in a
    :class:`fiftyone.core.dataset.Dataset`.
    """

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
    def create_new(cls, group, label, confidence=None, logits=None):
        """Creates a new :class:`ClassificationLabel`.

        Args:
            group: the group name of the label
            label: the label string
            confidence (None): a confidence in [0, 1] for the label
            logits (None): logits associated with the labels

        Returns:
            a :class:`ClassificationLabel`
        """
        return cls._create_new(
            group=group,
            label=label,
            confidence=confidence,
            logits=logits,
        )


class DetectionLabels(Label):
    """A set of object detections for an image sample in a
    :class:`fiftyone.core.dataset.Dataset`.

    Args:
        detections: a list of detection dicts
        **kwargs: keyword arguments for :class:`Label`
    """

    @property
    def detections(self):
        """The object detections."""
        return self._backing_doc.detections

    @classmethod
    def create_new(cls, group, detections):
        """Creates a new :class:`DetectionLabels`.

        Args:
            group: the group name of the label
            detections: a list of detection dicts of the following form::

                [
                    {
                        "label": label,
                        "bounding_box": [top-left-x, top-right-y, width, height],
                        "confidence": confidence,
                        ...
                    },
                    ...
                ]

        Returns:
            a :class:`DetectionLabels`
        """
        return cls._create_new(group=group, detections=detections)


class ImageLabels(Label):
    """A high-level collection of labels for an image sample in a
    :class:`fiftyone.core.dataset.Dataset`.
    """

    @property
    def labels(self):
        """The ``eta.core.image.ImageLabels``."""
        return etai.ImageLabels.from_dict(self._backing_doc.labels)

    @classmethod
    def create_new(cls, group, labels):
        """Creates a new :class:`DetectionLabels`.

        Args:
            group: the group name of the label
            labels: an ``eta.core.image.ImageLabels`` or a serialized dict
                representation of one

        Returns:
            a :class:`DetectionLabels`
        """
        if isinstance(labels, etai.ImageLabels):
            labels = labels.serialize()

        return cls._create_new(group=group, labels=labels)
