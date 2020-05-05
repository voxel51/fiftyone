"""
<<<<<<< HEAD
Core definitions of labels stored in FiftyOne dataset samples.
=======
Core Module for `fiftyone` Labels class
>>>>>>> develop

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
import eta.core.serial as etas
import eta.core.utils as etau


class Label(etas.Serializable):
    """A sample label in a :class:`fiftyone.core.dataset.Dataset`.

    Label instances represent an atomic group of labels associated with a
    sample in a dataset. Label instances may represent concrete tasks such as
    image classification (:class:`ClassificationLabel`) or image object
    detection (:class:`DetectionLabels`), or they may represent higher-level
    constructs such as a collection of labels for a particular sample
    (:class:`ImageLabels`).

    Args:
        group: the group name of the label
    """

    def __init__(self, group):
        self._group = group

    @property
    def type(self):
        """The fully-qualified class name of the label."""
        return etau.get_class_name(self)

    @property
    def group(self):
        """The group name of the label."""
        return self._group

    def attributes(self):
        """Returns the list of class attributes to be serialized.

        Returns:
            a list of class attributes
        """
        return ["type", "group"]

    @classmethod
    def from_dict(cls, d):
        """Constructs a `class`:Label` from a JSON dictionary.

        Args:
            d: a JSON dictionary

        Returns:
            a `class`:Label`
        """
        label_cls = etau.get_class(d["type"])
        return label_cls._from_dict(d, group=d["group"])

    @classmethod
    def _from_dict(cls, d, **kwargs):
        """Internal implementation of :func:`Label.from_dict`.

        Subclasses should implement this method, not :func:`Label.from_dict`.

        Args:
            d: a JSON dictionary
            **kwargs: keyword arguments for :class:`Label` that have already
                been parsed by :func:`Label.from_dict`

        Returns:
            a `class`:Label`
        """
        raise NotImplementedError("Subclass must implement _from_dict()")


class ClassificationLabel(Label):
    """A classification label for an image sample in a dataset.

    Args:
        label: the label string
        confidence: an optional confidence in [0, 1] associated with the label
        **kwargs: keyword arguments for :class:`Label`
    """

    def __init__(self, label, confidence=None, **kwargs):
        super(ClassificationLabel, self).__init__(**kwargs)
        self.label = label
        self.confidence = confidence

    def attributes(self):
        """Returns the list of class attributes to be serialized.

        Returns:
            a list of class attributes
        """
        _attrs = super(ClassificationLabel, self).attributes()
        _attrs.append("label")
        if self.confidence is not None:
            _attrs.append("confidence")

        return _attrs

    @classmethod
    def _from_dict(cls, d, **kwargs):
        confidence = d.get("confidence", None)
        return cls(d["label"], confidence=confidence, **kwargs)


class DetectionLabels(Label):
    """A set of object detection labels for an image sample in a dataset.

    Args:
        detections: a list of detection dicts
        **kwargs: keyword arguments for :class:`Label`
    """

    def __init__(self, detections, **kwargs):
        super(DetectionLabels, self).__init__(**kwargs)
        self.detections = detections

    def attributes(self):
        """Returns the list of class attributes to be serialized.

        Returns:
            a list of class attributes
        """
        return super(DetectionLabels, self).attributes() + ["detections"]

    @classmethod
    def _from_dict(cls, d, **kwargs):
        detections = d.get("detections", [])
        return cls(detections, **kwargs)


class ImageLabels(Label):
    """A high-level collection of labels for an image sample in a dataset.

    Args:
        labels: an ``eta.core.image.ImageLabels`` instance
        **kwargs: keyword arguments for :class:`Label`
    """

    def __init__(self, labels, **kwargs):
        super(ImageLabels, self).__init__(**kwargs)
        self.labels = labels

    def attributes(self):
        """Returns the list of class attributes to be serialized.

        Returns:
            a list of class attributes
        """
        return super(ImageLabels, self).attributes() + ["labels"]

    @classmethod
    def _from_dict(cls, d, **kwargs):
        labels = etai.ImageLabels.from_dict(d["labels"])
        return cls(labels, **kwargs)
