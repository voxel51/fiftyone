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
from future.utils import iteritems

# pragma pylint: enable=redefined-builtin
# pragma pylint: enable=unused-wildcard-import
# pragma pylint: enable=wildcard-import

import eta.core.data as etad
import eta.core.geometry as etag
import eta.core.image as etai
import eta.core.objects as etao

from fiftyone.core.odm.document import (
    ODMEmbeddedDocument,
    ODMDynamicEmbeddedDocument,
)
import fiftyone.core.fields as fof


class _NoDefault(object):
    pass


no_default = _NoDefault()


class Label(ODMEmbeddedDocument):
    """Base class for labels.

    Label instances represent a logical collection of labels associated with a
    sample in a dataset. Label instances may represent concrete tasks such as
    image classification (:class:`Classification`) or image object detection
    (:class:`Detections`), or they may represent higher-level constructs such
    as a collection of labels for a particular sample (:class:`ImageLabels`).
    """

    meta = {"allow_inheritance": True}


class ImageLabel(Label):
    """Base class for labels associated with images."""

    meta = {"allow_inheritance": True}

    def to_image_labels(self):
        """Returns an ``eta.core.image.ImageLabels`` representation of this
        instance.

        Returns:
            an ``eta.core.image.ImageLabels`` instance
        """
        raise NotImplementedError("Subclass must implement to_image_labels()")


class Attribute(ODMEmbeddedDocument):
    """Base class for attributes.

    Attribute instances represent an atomic piece of information, its
    ``value``, usually embedded with a ``name`` within a dict field of another
    :class:`Label` instance.

    Args:
        value (None): the attribute value
    """

    meta = {"allow_inheritance": True}

    value = fof.Field()


class BooleanAttribute(Attribute):
    """A boolean attribute.

    Args:
        value (None): the attribute value
    """

    value = fof.BooleanField()


class CategoricalAttribute(Attribute):
    """A categorical attribute.

    Args:
        value (None): the attribute value
        confidence (None): a confidence in ``[0, 1]`` for the value
        logits (None): logits associated with the attribute
    """

    value = fof.StringField()
    confidence = fof.FloatField()
    logits = fof.VectorField()


class NumericAttribute(Attribute):
    """A numeric attribute.

    Args:
        value (None): the attribute value
    """

    value = fof.FloatField()


class VectorAttribute(Attribute):
    """A vector attribute.

    Args:
        value (None): the attribute value
    """

    value = fof.VectorField()


class Classification(ImageLabel):
    """A classification label.

    See :class:`fiftyone.utils.data.ImageClassificationSampleParser` for a
    convenient way to build labels of this type for your existing datasets.

    Args:
        label (None): the label string
        confidence (None): a confidence in ``[0, 1]`` for the label
        logits (None): logits associated with the labels
        data ({}): a dict of additional data
    """

    meta = {"allow_inheritance": True}

    label = fof.StringField()
    confidence = fof.FloatField()
    logits = fof.VectorField()
    data = fof.DictField()

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
    """An object detection.

    Args:
        label (None): the label string
        bounding_box (None): a list of relative bounding box coordinates in
            ``[0, 1]`` in the following format::

            [<top-left-x>, <top-right-y>, <width>, <height>]

        confidence (None): a confidence in ``[0, 1]`` for the label
        attributes ({}): a dict mapping attribute names to :class:`Attribute`
            instances
        data ({}): a dict of additional data
    """

    meta = {"allow_inheritance": True}

    label = fof.StringField()
    bounding_box = fof.VectorField()
    confidence = fof.FloatField()
    attributes = fof.DictField(fof.EmbeddedDocumentField(Attribute))
    data = fof.DictField()

    def get_attribute_value(self, attr_name, default=no_default):
        """Gets the value of the attribute with the given name.

        Args:
            attr_name: the attribute name
            default (no_default): the default value to return if the attribute
                does not exist. Can be ``None``. If no default value is
                provided, an exception is raised if the attribute does not
                exist

        Returns:
            the attribute value

        Raises:
            KeyError: if the attribute does not exist and no default value was
                provided
        """
        try:
            # pylint: disable=unsubscriptable-object
            return self.attributes[attr_name].value
        except KeyError:
            if default is not no_default:
                return default

            raise


class Detections(ImageLabel):
    """A set of object detections for an image sample in a
    :class:`fiftyone.core.dataset.Dataset`.

    See :class:`fiftyone.utils.data.ImageDetectionSampleParser` for a
    convenient way to build labels of this type for your existing datasets.

    Args:
        detections (None): a list of :class:`Detection` instances
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
            label = detection.label

            tlx, tly, w, h = detection.bounding_box
            brx = tlx + w
            bry = tly + h
            bounding_box = etag.BoundingBox.from_coords(tlx, tly, brx, bry)

            confidence = detection.confidence

            attrs = etad.AttributeContainer()
            for attr_name, attr in iteritems(detection.attributes):
                attrs.add(etad.CategoricalAttribute(attr_name, attr.label))

            image_labels.add_object(
                etao.DetectedObject(
                    label=label,
                    bounding_box=bounding_box,
                    confidence=confidence,
                    attrs=attrs,
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
