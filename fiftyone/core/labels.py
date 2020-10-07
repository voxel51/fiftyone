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
import eta.core.keypoints as etak
import eta.core.image as etai
import eta.core.objects as etao
import eta.core.polylines as etap
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


class ListAttribute(Attribute):
    """A list attribute.

    The list can store arbitrary JSON-serialiable values.

    Args:
        value (None): the attribute value
    """

    value = fof.ListField()


class _HasAttributes(Label):
    """Mixin for :class:`Label` classes that have an ``attributes`` field that
    contains a dict of of :class:`Attribute` instances.
    """

    meta = {"allow_inheritance": True}

    attributes = fof.DictField(fof.EmbeddedDocumentField(Attribute))

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


class _HasID(Label):
    """Mixin for :class:`Label` classes that expose an ``id`` property that
    contains a unique identifier for the label.
    """

    meta = {"allow_inheritance": True}

    _id = fof.ObjectIdField(
        required=True, default=ObjectId, unique=True, primary_key=True
    )

    @property
    def id(self):
        """The ID of the label."""
        return str(self._id)

    def _get_repr_fields(self):
        # pylint: disable=no-member
        return ("id",) + self._fields_ordered


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


class Classification(ImageLabel, _HasID):
    """A classification label.

    Args:
        label (None): the label string
        confidence (None): a confidence in ``[0, 1]`` for the label
        logits (None): logits associated with the labels
    """

    meta = {"allow_inheritance": True}

    label = fof.StringField()
    confidence = fof.FloatField()
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


class Classifications(ImageLabel):
    """A list of classifications (typically from a multilabel model) in an
    image.

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


class Detection(ImageLabel, _HasID, _HasAttributes):
    """An object detection.

    Args:
        label (None): the label string
        bounding_box (None): a list of relative bounding box coordinates in
            ``[0, 1]`` in the following format::

            [<top-left-x>, <top-left-y>, <width>, <height>]

        mask (None): an instance segmentation mask for the detection within
            its bounding box, which should be a 2D binary or 0/1 integer NumPy
            array
        confidence (None): a confidence in ``[0, 1]`` for the label
        index (None): an index for the object
        attributes ({}): a dict mapping attribute names to :class:`Attribute`
            instances
    """

    meta = {"allow_inheritance": True}

    label = fof.StringField()
    bounding_box = fof.ListField()
    mask = fof.ArrayField()
    confidence = fof.FloatField()
    index = fof.IntField()

    def to_detected_object(self, name=None):
        """Returns an ``eta.core.objects.DetectedObject`` representation of
        this instance.

        Args:
            name (None): the name of the label field

        Returns:
            an ``eta.core.objects.DetectedObject``
        """
        label = self.label
        index = self.index

        # pylint: disable=unpacking-non-sequence
        tlx, tly, w, h = self.bounding_box
        brx = tlx + w
        bry = tly + h
        bounding_box = etag.BoundingBox.from_coords(tlx, tly, brx, bry)

        mask = self.mask
        confidence = self.confidence

        # pylint: disable=no-member
        attrs = _to_eta_attributes(self.attributes)

        return etao.DetectedObject(
            label=label,
            index=index,
            bounding_box=bounding_box,
            mask=mask,
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
        xtl, ytl, xbr, ybr = dobj.bounding_box.to_coords()
        bounding_box = [xtl, ytl, (xbr - xtl), (ybr - ytl)]

        attributes = _from_eta_attributes(dobj.attrs)

        return cls(
            label=dobj.label,
            bounding_box=bounding_box,
            confidence=dobj.confidence,
            index=dobj.index,
            mask=dobj.mask,
            attributes=attributes,
        )


class Detections(ImageLabel):
    """A list of object detections in an image.

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
        return cls(
            detections=[
                Detection.from_detected_object(dobj) for dobj in objects
            ]
        )


class Polyline(ImageLabel, _HasID, _HasAttributes):
    """A polyline or polygon.

    Args:
        label (None): a label for the shape
        points (None): a list of ``(x, y)`` points in ``[0, 1] x [0, 1]``
            describing the vertexes of a polyline
        closed (False): whether the polyline is closed, i.e., and edge should
            be drawn from the last vertex to the first vertex
        filled (False): whether the polyline represents a shape that can be
            filled when rendering it
        attributes ({}): a dict mapping attribute names to :class:`Attribute`
            instances
    """

    meta = {"allow_inheritance": True}

    label = fof.StringField()
    points = fof.ListField()
    closed = fof.BooleanField(default=False)
    filled = fof.BooleanField(default=False)

    def to_eta_polyline(self, name=None):
        """Returns an ``eta.core.polylines.Polyline`` representation of this
        instance.

        Args:
            name (None): the name of the label field

        Returns:
            an ``eta.core.polylines.Polyline``
        """
        # pylint: disable=no-member
        attrs = _to_eta_attributes(self.attributes)

        return etap.Polyline(
            label=self.label,
            name=name,
            points=self.points,
            closed=self.closed,
            filled=self.filled,
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
        image_labels.add_polyline(self.to_eta_polyline(name=name))
        return image_labels

    @classmethod
    def from_eta_polyline(cls, polyline):
        """Creates a :class:`Polyline` instance from an
        ``eta.core.polylines.Polyline``.

        Args:
            polyline: an ``eta.core.polylines.Polyline``

        Returns:
            a :class:`Polyline`
        """
        attributes = _from_eta_attributes(polyline.attrs)

        return cls(
            label=polyline.label,
            points=polyline.points,
            closed=polyline.closed,
            filled=polyline.filled,
            attributes=attributes,
        )


class Polylines(ImageLabel):
    """A list of polylines or polygons in an image.

    Args:
        polylines (None): a list of :class:`Polyline` instances
    """

    meta = {"allow_inheritance": True}

    polylines = fof.ListField(fof.EmbeddedDocumentField(Polyline))

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
        for polyline in self.polylines:
            image_labels.add_polyline(polyline.to_eta_polyline(name=name))

        return image_labels

    @classmethod
    def from_eta_polylines(cls, polylines):
        """Creates a :class:`Polylines` instance from an
        ``eta.core.polylines.PolylineContainer``.

        Args:
            polylines: an ``eta.core.polylines.PolylineContainer``

        Returns:
            a :class:`Polylines`
        """
        return cls(
            polylines=[Polyline.from_eta_polyline(p) for p in polylines]
        )


class Keypoint(ImageLabel, _HasID, _HasAttributes):
    """A list of keypoints in an image.

    Args:
        label (None): a label for the points
        points (None): a list of ``(x, y)`` keypoints in ``[0, 1] x [0, 1]``
        attributes ({}): a dict mapping attribute names to :class:`Attribute`
            instances
    """

    meta = {"allow_inheritance": True}

    label = fof.StringField()
    points = fof.ListField()

    def to_eta_keypoints(self, name=None):
        """Returns an ``eta.core.keypoints.Keypoints`` representation of this
        instance.

        Args:
            name (None): the name of the label field

        Returns:
            an ``eta.core.keypoints.Keypoints``
        """
        # pylint: disable=no-member
        attrs = _to_eta_attributes(self.attributes)

        return etak.Keypoints(
            name=name, label=self.label, points=self.points, attrs=attrs,
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
        image_labels.add_keypoints(self.to_eta_keypoints(name=name))
        return image_labels

    @classmethod
    def from_eta_keypoints(cls, keypoints):
        """Creates a :class:`Keypoint` instance from an
        ``eta.core.keypoints.Keypoints``.

        Args:
            keypoints: an ``eta.core.keypoints.Keypoints``

        Returns:
            a :class:`Keypoint`
        """
        attributes = _from_eta_attributes(keypoints.attrs)

        return cls(
            label=keypoints.label,
            points=keypoints.points,
            attributes=attributes,
        )


class Keypoints(ImageLabel):
    """A list of :class:`Keypoint` instances in an image.

    Args:
        keypoints (None): a list of :class:`Keypoint` instances
    """

    meta = {"allow_inheritance": True}

    keypoints = fof.ListField(fof.EmbeddedDocumentField(Keypoint))

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
        for keypoint in self.keypoints:
            image_labels.add_keypoints(keypoint.to_eta_keypoints(name=name))

        return image_labels

    @classmethod
    def from_eta_keypoints(cls, keypoints):
        """Creates a :class:`Keypoints` instance from an
        ``eta.core.keypoints.KeypointsContainer``.

        Args:
            keypoints: an ``eta.core.keypoints.KeypointsContainer``

        Returns:
            a :class:`Keypoints`
        """
        return cls(
            keypoints=[Keypoint.from_eta_keypoints(k) for k in keypoints]
        )


class Segmentation(ImageLabel):
    """A semantic segmentation mask for an image.

    Args:
        mask (None): a semantic segmentation mask, which should be a 2D NumPy
            array with integer values encoding the semantic labels
    """

    meta = {"allow_inheritance": True}

    mask = fof.ArrayField()

    def to_image_labels(self, name=None):
        """Returns an ``eta.core.image.ImageLabels`` representation of this
        instance.

        Args:
            name (None): the name of the label field

        Returns:
            an ``eta.core.image.ImageLabels``
        """
        return etai.ImageLabels(mask=self.mask)


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
        the labels are expanded. Otherwise, all labels are expanded as
        explained below.

        If ``multilabel`` is False, frame attributes will be stored in separate
        :class:`Classification` fields with names ``prefix + attr.name``.

        If ``multilabel`` if True, all frame attributes will be stored in a
        :class:`Classifications` field called ``prefix + "attrs"``.

        Objects are expanded into fields with names ``prefix + obj.name``, or
        ``prefix + "objs"`` for objects that do not have their ``name`` field
        populated.

        Polylines are expanded into fields with names
        ``prefix + polyline.name``, or ``prefix + "polylines"`` for polylines
        that do not have their ``name`` field populated.

        Keypoints are expanded into fields with names
        ``prefix + keypoints.name``, or ``prefix + "keypoints"`` for keypoints
        that do not have their ``name`` field populated.

        Args:
            prefix (None): a string prefix to prepend to each field name in the
                output dict
            labels_dict (None): a dictionary mapping names of labels to keys to
                assign them in the output dictionary
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


def _from_eta_attributes(attrs):
    attributes = {}
    for attr in attrs:
        if isinstance(attr, etad.NumericAttribute):
            _attr = NumericAttribute(value=attr.value)
        elif isinstance(attr, etad.BooleanAttribute):
            _attr = BooleanAttribute(value=attr.value)
        else:
            _attr = CategoricalAttribute(value=str(attr.value))

        if attr.confidence is not None:
            _attr.confidence = attr.confidence

        attributes[attr.name] = _attr

    return attributes


def _to_eta_attributes(attributes):
    attrs = etad.AttributeContainer()
    for attr_name, attr in attributes.items():
        attr_value = attr.value
        if isinstance(attr_value, bool):
            _attr = etad.BooleanAttribute(attr_name, attr_value)
        elif etau.is_numeric(attr_value):
            _attr = etad.NumericAttribute(attr_name, attr_value)
        else:
            _attr = etad.CategoricalAttribute(attr_name, str(attr_value))

        attrs.add(_attr)

    return attrs


def _expand_with_prefix(
    image_labels, prefix, multilabel, skip_non_categorical
):
    if prefix is None:
        prefix = ""

    labels = {}
    _image_labels = image_labels.labels

    #
    # Classifications
    #

    if multilabel:
        # Store frame attributes as multilabels
        # pylint: disable=no-member
        labels[prefix + "attrs"] = Classifications.from_attributes(
            _image_labels.attrs, skip_non_categorical=skip_non_categorical,
        )
    else:
        # Store each frame attribute separately
        for attr in _image_labels.attrs:  # pylint: disable=no-member
            if skip_non_categorical and not etau.is_str(attr.value):
                continue

            labels[prefix + attr.name] = Classification.from_attribute(attr)

    #
    # Detections
    #

    objects_map = defaultdict(etao.DetectedObjectContainer)

    for dobj in _image_labels.objects:
        objects_map[prefix + (dobj.name or "objs")].add(dobj)

    for name, objects in objects_map.items():
        # pylint: disable=no-member
        labels[name] = Detections.from_detected_objects(objects)

    #
    # Polylines
    #

    polylines_map = defaultdict(etap.PolylineContainer)

    for polyline in _image_labels.polylines:
        polylines_map[prefix + (polyline.name or "polylines")].add(polyline)

    for name, polylines in polylines_map.items():
        # pylint: disable=no-member
        labels[name] = Polylines.from_eta_polylines(polylines)

    #
    # Keypoints
    #

    keypoints_map = defaultdict(etak.KeypointsContainer)

    for keypoints in _image_labels.keypoints:
        keypoints_map[prefix + (keypoints.name or "keypoints")].add(keypoints)

    for name, keypoints in keypoints_map.items():
        # pylint: disable=no-member
        labels[name] = Keypoints.from_eta_keypoints(keypoints)

    return labels


def _expand_with_labels_dict(
    image_labels, labels_dict, multilabel, skip_non_categorical
):
    labels = {}
    _image_labels = image_labels.labels

    #
    # Classifications
    #

    if multilabel:
        # Store frame attributes as multilabels
        attrs_map = defaultdict(etad.AttributeContainer)
        for attr in _image_labels.attrs:
            if attr.name not in labels_dict:
                continue

            attrs_map[labels_dict[attr.name]].add(attr)

        for name, attrs in attrs_map.items():
            labels[name] = Classifications.from_attributes(
                attrs, skip_non_categorical=skip_non_categorical
            )
    else:
        # Store each frame attribute separately
        for attr in _image_labels.attrs:  # pylint: disable=no-member
            if skip_non_categorical and not etau.is_str(attr.value):
                continue

            if attr.name not in labels_dict:
                continue

            labels[labels_dict[attr.name]] = Classification.from_attribute(
                attr
            )

    #
    # Detections
    #

    objects_map = defaultdict(etao.DetectedObjectContainer)

    for dobj in _image_labels.objects:
        if dobj.name not in labels_dict:
            continue

        objects_map[labels_dict[dobj.name]].add(dobj)

    for name, objects in objects_map.items():
        # pylint: disable=no-member
        labels[name] = Detections.from_detected_objects(objects)

    #
    # Polylines
    #

    polylines_map = defaultdict(etap.PolylineContainer)

    for polyline in _image_labels.polylines:
        if polyline.name not in labels_dict:
            continue

        polylines_map[labels_dict[polyline.name]].add(polyline)

    for name, polylines in polylines_map.items():
        # pylint: disable=no-member
        labels[name] = Polylines.from_eta_polylines(polylines)

    #
    # Keypoints
    #

    keypoints_map = defaultdict(etak.KeypointsContainer)

    for keypoints in _image_labels.keypoints:
        if keypoints.name not in labels_dict:
            continue

        keypoints_map[labels_dict[keypoints.name]].add(keypoints)

    for name, keypoints in keypoints_map.items():
        # pylint: disable=no-member
        labels[name] = Keypoints.from_eta_keypoints(keypoints)

    return labels
