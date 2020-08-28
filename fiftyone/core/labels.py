"""
Labels stored in dataset samples.

| Copyright 2017-2020, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""
from bson.objectid import ObjectId
from collections import defaultdict

import eta.core.data as etad
import eta.core.geometry as etag
import eta.core.image as etai
import eta.core.objects as etao
import eta.core.utils as etau

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

    @classmethod
    def from_attribute(cls, attr):
        """Creates a :class:`Classification` instance from an attribute.

        The attribute value is cast to a string, if necessary.

        Args:
            attr: an :class:`Attribute` or ``eta.core.data.Attribute``

        Returns:
            a :class:`Classification`
        """
        classification = cls(label=str(attr.value))

        try:
            classification.confidence = attr.confidence
        except:
            pass

        return classification

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

    @classmethod
    def from_attributes(cls, attrs, skip_non_categorical=False):
        """Creates a :class:`Classifications` instance from a list of
        attributes.

        Args:
            attrs: an iterable of :class:`Attribute` or
                ``eta.core.data.Attribute`` instances
            skip_non_categorical (False): whether to skip non-categorical
                attributes (True) or cast all attribute values to strings
                (False)

        Returns:
            a :class:`Classifications`
        """
        classifications = []
        for attr in attrs:
            if skip_non_categorical and not etau.is_str(attr.value):
                continue

            classifications.append(Classification.from_attribute(attr))

        return cls(classifications=classifications)


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
            attr_value = attr.value
            if isinstance(attr_value, bool):
                _attr = etad.BooleanAttribute(attr_name, attr_value)
            elif etau.is_numeric(attr_value):
                _attr = etad.NumericAttribute(attr_name, attr_value)
            else:
                _attr = etad.CategoricalAttribute(attr_name, str(attr_value))

            attrs.add(_attr)

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

    @classmethod
    def from_detected_object(cls, dobj):
        """Creates a :class:`Detection` instance from an
        ``eta.core.objects.DetectedObject``.

        Args:
            dobj: a ``eta.core.objects.DetectedObject``

        Returns:
            a :class:`Detection`
        """
        # Bounding box
        xtl, ytl, xbr, ybr = dobj.bounding_box.to_coords()
        bounding_box = [xtl, ytl, (xbr - xtl), (ybr - ytl)]

        # Atrributes
        attributes = {}
        for attr in dobj.attrs:
            if isinstance(attr, etad.NumericAttribute):
                _attr = NumericAttribute(value=attr.value)
            elif isinstance(attr, etad.BooleanAttribute):
                _attr = BooleanAttribute(value=attr.value)
            else:
                _attr = CategoricalAttribute(value=str(attr.value))

            if attr.confidence is not None:
                _attr.confidence = attr.confidence

            attributes[attr.name] = _attr

        return Detection(
            label=dobj.label,
            confidence=dobj.confidence,
            bounding_box=bounding_box,
            attributes=attributes,
        )

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

    @classmethod
    def from_detected_objects(cls, objects):
        """Creates a :class:`Detections` instance from an
        ``eta.core.objects.DetectedObjectContainer``.

        Args:
            objects: a ``eta.core.objects.DetectedObjectContainer``

        Returns:
            a :class:`Detections`
        """
        return Detections(
            detections=[
                Detection.from_detected_object(dobj) for dobj in objects
            ]
        )


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

    def expand(
        self,
        prefix=None,
        labels_dict=None,
        multilabel=False,
        skip_non_categorical=False,
    ):
        """Expands the image labels into a dictionary of :class:`Label`
        instances.

        Provide ``labels_dict`` if you want to customize which components of
        the labels are expanded. Otherwise, all objects/attributes are expanded
        as explained below.

        If ``multilabel`` is False, frame attributes will be stored in separate
        :class:`Classification` fields with names ``prefix + attr.name``.

        If ``multilabel`` if True, all frame attributes will be stored in a
        :class:`Classifications` field called ``prefix + "attrs"``.

        Objects are expanded into fields with names ``prefix + obj.name``, or
        ``prefix + "objs"`` for objects that do not have their ``name`` field
        populated.

        Args:
            prefix (None): a string prefix to prepend to each field name in the
                output dict
            labels_dict (None): a dictionary mapping names of
                attributes/objects to keys to assign them in the output
                dictionary
            multilabel (False): whether to store frame attributes in a single
                :class:`Classifications` instance
            skip_non_categorical (False): whether to skip non-categorical
                frame attributes (True) or cast them to strings (False)

        Returns:
            a dict mapping label names to :class:`Label` instances
        """
        if labels_dict is not None:
            return _expand_with_labels_dict(
                self, labels_dict, multilabel, skip_non_categorical
            )

        return _expand_with_prefix(
            self, prefix, multilabel, skip_non_categorical
        )


def _expand_with_prefix(
    image_labels, prefix, multilabel, skip_non_categorical
):
    if prefix is None:
        prefix = ""

    labels = {}

    if multilabel:
        # Store frame attributes as multilabels
        # pylint: disable=no-member
        labels[prefix + "attrs"] = Classifications.from_attributes(
            image_labels.labels.attrs,
            skip_non_categorical=skip_non_categorical,
        )
    else:
        # Store each frame attribute separately
        for attr in image_labels.labels.attrs:  # pylint: disable=no-member
            if skip_non_categorical and not etau.is_str(attr.value):
                continue

            labels[prefix + attr.name] = Classification.from_attribute(attr)

    objects_map = defaultdict(etao.DetectedObjectContainer)

    for dobj in image_labels.labels.objects:
        objects_map[prefix + (dobj.name or "objs")].add(dobj)

    for name, objects in objects_map.items():
        # pylint: disable=no-member
        labels[name] = Detections.from_detected_objects(objects)

    return labels


def _expand_with_labels_dict(
    image_labels, labels_dict, multilabel, skip_non_categorical
):
    labels = {}

    if multilabel:
        # Store frame attributes as multilabels
        attrs_map = defaultdict(etad.AttributeContainer)
        for attr in image_labels.labels.attrs:
            if attr.name not in labels_dict:
                continue

            attrs_map[labels_dict[attr.name]].add(attr)

        for name, attrs in attrs_map.items():
            labels[name] = Classifications.from_attributes(
                attrs, skip_non_categorical=skip_non_categorical
            )
    else:
        # Store each frame attribute separately
        for attr in image_labels.labels.attrs:  # pylint: disable=no-member
            if skip_non_categorical and not etau.is_str(attr.value):
                continue

            if attr.name not in labels_dict:
                continue

            labels[labels_dict[attr.name]] = Classification.from_attribute(
                attr
            )

    objects_map = defaultdict(etao.DetectedObjectContainer)

    for dobj in image_labels.labels.objects:
        if dobj.name not in labels_dict:
            continue

        objects_map[labels_dict[dobj.name]].add(dobj)

    for name, objects in objects_map.items():
        # pylint: disable=no-member
        labels[name] = Detections.from_detected_objects(objects)

    return labels
