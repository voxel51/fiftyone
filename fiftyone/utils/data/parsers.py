"""
Sample parsers.

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

import numpy as np

import eta.core.image as etai
import eta.core.serial as etas
import eta.core.utils as etau

import fiftyone.core.labels as fol


class SampleParser(object):
    """Interface for parsing samples emitted by dataset iterators."""

    def parse(self, sample):
        """Parses the given sample.

        Args:
            sample: the sample

        Returns:
            the parsed sample
        """
        raise NotImplementedError("subclasses must implement parse()")


class UnlabeledImageSampleParser(SampleParser):
    """Interface for parsing unlabeled image samples emitted by dataset
    iterators.

    This interface enforces the contract that the `sample` passed to
    :func:`parse` must contain an image (or path to one) that will be
    parsed/decoded/loaded and outputted as a numpy array.

    Subclasses can customize this behavior as necessary, but, the default
    implementation here assumes that the provided sample is either an image
    that can be converted to numpy format via ``np.asarray()`` or the path
    to an image on disk.
    """

    def parse(self, sample):
        """Parses the given image.

        Args:
            sample: the sample

        Returns:
            a numpy image
        """
        if etau.is_str(sample):
            return etai.read(sample)

        return np.asarray(sample)


class LabeledImageSampleParser(SampleParser):
    """Interface for parsing labeled image samples emitted by dataset
    iterators whose labels are to be stored as
    :class:`fiftyone.core.labels.Label` instances.

    This interface enforces the contract that the `sample` passed to
    :func:`LabeledImageSampleParser.parse` must contain the following two
    items:

        - an image (or path to one) that will be parsed/decoded/loaded and
          outputted as a numpy array

        - labels that will be outputted in :class:`fiftyone.core.labels.Label`
          format

    The default implementation provided by this class supports samples that are
    ``(image_or_path, label)`` tuples, where:

        - ``image_or_path`` is either an image that can be converted to numpy
          format via ``np.asarray()`` or the path to an image on disk

        - ``label`` is a :class:`fiftyone.core.labels.Label` instance

    To support situations where either the image or label, but not both, are
    desired, this interface provides individual
    :func:`LabeledImageSampleParser.parse_image` and
    :func:`LabeledImageSampleParser.parse_label` methods that can parse each
    respective component of the sample in isolation.

    See the subclasses of this method for implementations that parse labels for
    common tasks:

        - Image classification: :class:`ImageClassificationSampleParser`

        - Object detection: :class:`ImageDetectionSampleParser`

        - Multitask image prediction: :class:`ImageLabelsSampleParser`
    """

    def parse_image(self, sample):
        """Parses the image from the given sample.

        Args:
            sample: the sample

        Returns:
            a numpy image
        """
        image_or_path = sample[0]
        if etau.is_str(image_or_path):
            return etai.read(image_or_path)

        return np.asarray(image_or_path)

    def parse_label(self, sample):
        """Parses the label from the given sample.

        Args:
            sample: the sample

        Returns:
            a :class:`fiftyone.core.labels.Label` instance
        """
        return sample[1]

    def parse(self, sample):
        """Parses the given sample.

        Args:
            sample: the sample

        Returns:
            img: a numpy image
            label: a :class:`fiftyone.core.labels.Label` instance
        """
        img = self.parse_image(sample)
        label = self.parse_label(sample)
        return img, label


class ImageClassificationSampleParser(LabeledImageSampleParser):
    """Interface for parsing image classification samples emitted by dataset
    iterators whose labels are to be stored as
    :class:`fiftyone.core.labels.Classification` instances.

    The default implementation provided by this class supports samples that are
    ``(image_or_path, target)`` tuples, where:

        - ``image_or_path`` is either an image that can be converted to numpy
          format via ``np.asarray()`` or the path to an image on disk

        - ``target`` is either a class ID (if ``classes`` is provided) or a
          label string

    Subclasses can support other input sample formats as necessary.

    Args:
        classes (None): an optional list of class label strings. If provided,
            it is assumed that ``target`` is a class ID that should be mapped
            to a label string via ``classes[target]``
    """

    def __init__(self, classes=None):
        self.classes = classes

    def parse_label(self, sample):
        """Parses the classification target from the given sample.

        Args:
            sample: the sample

        Returns:
            a :class:`fiftyone.core.labels.Classification` instance
        """
        target = sample[1]

        try:
            label = self.classes[target]
        except:
            label = target

        return fol.Classification(label=label)


class ImageDetectionSampleParser(LabeledImageSampleParser):
    """Interface for parsing image detection samples emitted by dataset
    iterators whose labels are to be stored as
    :class:`fiftyone.core.labels.Detections` instances.

    The default implementation provided by this class supports samples that are
    ``(image_or_path, detections_or_path)`` tuples, where:

        - ``image_or_path`` is either an image that can be converted to numpy
          format via ``np.asarray()`` or the path to an image on disk

        - ``detections_or_path`` is either a list of detections in the
          following format::

            [
                {
                    "label": <target>,
                    "bounding_box": [
                        <top-left-x>, <top-left-y>, <width>, <height>
                    ],
                    "confidence": <optional-confidence>,
                },
                ...
            ]

          or the path to such a file on disk.

          In the above, ``target`` is either a class ID (if ``classes`` is
          provided) or a label string, and the bounding box coordinates can
          either be relative coordinates in ``[0, 1]``
          (if ``normalized == True``) or absolute pixels coordinates
          (if ``normalized == False``). The ``confidence`` field is optional
          for each sample.

          The input field names can be configured as necessary when
          instantiating the parser.

    Subclasses can support other input sample formats as necessary.

    Args:
        label_field ("label"): the name of the object label field in the
            target dicts
        bounding_box_field ("bounding_box"): the name of the bounding box field
            in the target dicts
        confidence_field ("confidence"): the name of the optional confidence
            field in the target dicts
        classes (None): an optional list of class label strings. If provided,
            it is assumed that the ``target`` values are class IDs that should
            be mapped to label strings via ``classes[target]``
        normalized (True): whether the bounding box coordinates are absolute
            pixel coordinates (``False``) or relative coordinates in [0, 1]
            (``True``)
    """

    def __init__(
        self,
        label_field="label",
        bounding_box_field="bounding_box",
        confidence_field="confidence",
        classes=None,
        normalized=True,
    ):
        self.label_field = label_field
        self.bounding_box_field = bounding_box_field
        self.confidence_field = confidence_field
        self.classes = classes
        self.normalized = normalized

    def parse_image(self, sample):
        """Parses the image from the given sample.

        Args:
            sample: the sample

        Returns:
            a numpy image
        """
        image_or_path = sample[0]
        return self._parse_image(image_or_path)

    def parse_label(self, sample):
        """Parses the detection target from the given sample.

        Args:
            sample: the sample

        Returns:
            a :class:`fiftyone.core.labels.Detections` instance
        """
        target = sample[1]

        if not self.normalized:
            # Absolute bounding box coordinates were provided, so we must have
            # the image to convert to relative coordinates
            img = self._parse_image(sample[0])
        else:
            img = None

        return self._parse_label(target, img=img)

    def parse(self, sample):
        """Parses the given sample.

        Args:
            sample: the sample

        Returns:
            img: a numpy image
            label: a :class:`fiftyone.core.labels.Detections` instance
        """
        img, target = sample
        img = self._parse_image(img)
        label = self._parse_label(target, img=img)
        return img, label

    def _parse_image(self, image_or_path):
        if etau.is_str(image_or_path):
            return etai.read(image_or_path)

        return np.asarray(image_or_path)

    def _parse_label(self, target, img=None):
        if etau.is_str(target):
            target = etas.load_json(target)

        return fol.Detections(
            detections=[self._parse_detection(obj, img=img) for obj in target]
        )

    def _parse_detection(self, obj, img=None):
        label = obj[self.label_field]

        try:
            label = self.classes[label]
        except:
            pass

        tlx, tly, w, h = obj[self.bounding_box_field]
        if not self.normalized:
            tlx, tly, w, h = _to_rel_bounding_box(tlx, tly, w, h, img)

        bounding_box = [tlx, tly, w, h]

        confidence = obj.get(self.confidence_field, None)

        return fol.Detection(
            label=label, bounding_box=bounding_box, confidence=confidence,
        )


class ImageLabelsSampleParser(LabeledImageSampleParser):
    """Interface for parsing labeled image samples emitted by dataset
    iterators whose labels are to be stored as
    :class:`fiftyone.core.labels.ImageLabels` instances.

    The default implementation provided by this class supports samples that are
    ``(image_or_path, image_labels_or_path)`` tuples, where:

        - ``image_or_path`` is either an image that can be converted to numpy
          format via ``np.asarray()`` or the path to an image on disk

        - ``image_labels_or_path`` is an ``eta.core.image.ImageLabels``
          instance, a serialized dict representation of one, or the path to one
          on disk

    Subclasses can support other input sample formats as necessary.
    """

    def parse_label(self, sample):
        """Parses the labels from the given sample.

        Args:
            sample: the sample

        Returns:
            a :class:`fiftyone.core.labels.ImageLabels` instance
        """
        labels = sample[1]

        if etau.is_str(labels):
            labels = etai.ImageLabels.from_dict(labels)

        return fol.ImageLabels(labels=labels)


def _to_rel_bounding_box(tlx, tly, w, h, img):
    height, width = img.shape[:2]
    return (
        tlx / width,
        tly / height,
        w / width,
        h / height,
    )
