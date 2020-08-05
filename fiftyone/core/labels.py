"""
Labels stored in dataset samples.

| Copyright 2017-2020, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""
from bson.objectid import ObjectId

import eta.core.data as etad
import eta.core.geometry as etag
import eta.core.image as etai
import eta.core.objects as etao

from fiftyone.core.odm.document import DynamicEmbeddedDocument
import fiftyone.core.fields as fof


class _NoDefault(object):
    pass


no_default = _NoDefault()


class Label(DynamicEmbeddedDocument):
    """Base class for labels.

    Label instances represent a logical collection of labels associated with a
    sample in a dataset. Label instances may represent concrete tasks such as
    image classification (:class:`Classification`) or image object detection
    (:class:`Detections`), or they may represent higher-level constructs such
    as a collection of labels for a particular sample (:class:`ImageLabels`).
    """

    meta = {"allow_inheritance": True}


class Attribute(DynamicEmbeddedDocument):
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


class ImageLabel(Label):
    """Base class for labels associated with images."""

    meta = {"allow_inheritance": True}

    def to_image_labels(self, name=None):
        """Returns an ``eta.core.image.ImageLabels`` representation of this
        instance.

        Args:
            name (None): the name of the label field

        Returns:
            an ``eta.core.image.ImageLabels``
        """
        raise NotImplementedError("Subclass must implement to_image_labels()")


class Classification(ImageLabel):
    """A classification label.

    Args:
        label (None): the label string
        confidence (None): a confidence in ``[0, 1]`` for the label
        logits (None): logits associated with the labels
    """

    meta = {"allow_inheritance": True}

    _id = fof.ObjectIdField(
        required=True, default=ObjectId, unique=True, primary_key=True
    )
    label = fof.StringField()
    confidence = fof.FloatField()
    logits = fof.VectorField()

    @property
    def id(self):
        """The ID of the document."""
        return str(self._id)

    def to_image_labels(self, name=None):
        """Returns an ``eta.core.image.ImageLabels`` representation of this
        instance.

        Args:
            name (None): the name of the label field

        Returns:
            an ``eta.core.image.ImageLabels``
        """
        image_labels = etai.ImageLabels()
        image_labels.add_attribute(
            etad.CategoricalAttribute(
                name, self.label, confidence=self.confidence
            )
        )
        return image_labels

    def _get_repr_fields(self):
        # pylint: disable=no-member
        return ("id",) + self._fields_ordered


class Classifications(ImageLabel):
    """A list of classifications (typically from a multilabel model) for an
    image sample in a :class:`fiftyone.core.dataset.Dataset`.

    Args:
        classifications (None): a list of :class:`Classification` instances
    """

    meta = {"allow_inheritance": True}

    classifications = fof.ListField(fof.EmbeddedDocumentField(Classification))
    logits = fof.VectorField()

    def to_image_labels(self, name=None):
        """Returns an ``eta.core.image.ImageLabels`` representation of this
        instance.

        Args:
            name (None): the name of the label field

        Returns:
            an ``eta.core.image.ImageLabels``
        """
        image_labels = etai.ImageLabels()

        # pylint: disable=not-an-iterable
        for classification in self.classifications:
            image_labels.add_attribute(
                etad.CategoricalAttribute(
                    name,
                    classification.label,
                    confidence=classification.confidence,
                )
            )

        return image_labels


class Detection(ImageLabel):
    """An object detection.

    Args:
        label (None): the label string
        bounding_box (None): a list of relative bounding box coordinates in
            ``[0, 1]`` in the following format::

            [<top-left-x>, <top-left-y>, <width>, <height>]

        confidence (None): a confidence in ``[0, 1]`` for the label
        attributes ({}): a dict mapping attribute names to :class:`Attribute`
            instances
    """

    meta = {"allow_inheritance": True}

    _id = fof.ObjectIdField(
        required=True, default=ObjectId, unique=True, primary_key=True
    )
    label = fof.StringField()
    bounding_box = fof.VectorField()
    confidence = fof.FloatField()
    attributes = fof.DictField(fof.EmbeddedDocumentField(Attribute))

    @property
    def id(self):
        """The ID of the document."""
        return str(self._id)

    def has_attribute(self, name):
        """Determines whether the detection has an attribute with the given
        name.

        Args:
            name: the attribute name

        Returns:
            True/False
        """
        # pylint: disable=unsupported-membership-test
        return name in self.attributes

    def get_attribute_value(self, name, default=no_default):
        """Gets the value of the attribute with the given name.

        Args:
            name: the attribute name
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
            return self.attributes[name].value
        except KeyError:
            if default is not no_default:
                return default

            raise

    def to_detected_object(self, name=None):
        """Returns an ``eta.core.objects.DetectedObject`` representation of
        this instance.

        Args:
            name (None): the name of the label field

        Returns:
            an ``eta.core.objects.DetectedObject``
        """
        label = self.label

        # pylint: disable=unpacking-non-sequence
        tlx, tly, w, h = self.bounding_box
        brx = tlx + w
        bry = tly + h
        bounding_box = etag.BoundingBox.from_coords(tlx, tly, brx, bry)

        confidence = self.confidence

        # pylint: disable=no-member
        attrs = etad.AttributeContainer()
        for attr_name, attr in self.attributes.items():
            attrs.add(etad.CategoricalAttribute(attr_name, attr.value))

        return etao.DetectedObject(
            label=label,
            bounding_box=bounding_box,
            confidence=confidence,
            name=name,
            attrs=attrs,
        )

    def to_image_labels(self, name=None):
        """Returns an ``eta.core.image.ImageLabels`` representation of this
        instance.

        Args:
            name (None): the name of the label field

        Returns:
            an ``eta.core.image.ImageLabels``
        """
        image_labels = etai.ImageLabels()
        image_labels.add_object(self.to_detected_object(name=name))
        return image_labels

    def _get_repr_fields(self):
        # pylint: disable=no-member
        return ("id",) + self._fields_ordered


class Detections(ImageLabel):
    """A list of object detections for an image sample in a
    :class:`fiftyone.core.dataset.Dataset`.

    Args:
        detections (None): a list of :class:`Detection` instances
    """

    meta = {"allow_inheritance": True}

    detections = fof.ListField(fof.EmbeddedDocumentField(Detection))

    def to_image_labels(self, name=None):
        """Returns an ``eta.core.image.ImageLabels`` representation of this
        instance.

        Args:
            name (None): the name of the label field

        Returns:
            an ``eta.core.image.ImageLabels``
        """
        image_labels = etai.ImageLabels()

        # pylint: disable=not-an-iterable
        for detection in self.detections:
            image_labels.add_object(detection.to_detected_object(name=name))

        return image_labels


class ImageLabels(ImageLabel):
    """A collection of multitask labels for an image sample in a
    :class:`fiftyone.core.dataset.Dataset`.

    Args:
        labels: an ``eta.core.image.ImageLabels`` or a serialized dict
            representation of one
    """

    meta = {"allow_inheritance": True}

    labels = fof.ImageLabelsField()

    def to_image_labels(self, name=None):
        """Returns an ``eta.core.image.ImageLabels`` representation of this
        instance.

        Args:
            name (None): the name of the label field

        Returns:
            an ``eta.core.image.ImageLabels``
        """
        return self.labels
