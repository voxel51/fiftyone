"""
Labels stored in dataset samples.

| Copyright 2017-2021, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""
import itertools
import warnings

from bson import ObjectId
import cv2
import numpy as np

import eta.core.data as etad
import eta.core.geometry as etag
import eta.core.keypoints as etak
import eta.core.image as etai
import eta.core.objects as etao
import eta.core.polylines as etap
import eta.core.utils as etau

from fiftyone.core.odm.document import DynamicEmbeddedDocument
import fiftyone.core.fields as fof
import fiftyone.core.utils as fou

foug = fou.lazy_import("fiftyone.utils.geojson")
sg = fou.lazy_import(
    "shapely.geometry", callback=lambda: fou.ensure_package("shapely")
)


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
    """Mixin for :class:`Label` classes that have an :attr:`attributes` field
    that contains a dict of of :class:`Attribute` instances.
    """

    meta = {"allow_inheritance": True}

    attributes = fof.DictField(fof.EmbeddedDocumentField(Attribute))

    def iter_attributes(self):
        """Returns an iterator over the custom attributes of the label.

        Returns:
            a generator that emits ``(name, value)`` tuples
        """
        # pylint: disable=no-member
        custom_fields = set(self._fields_ordered) - set(self._fields.keys())
        custom_fields.update(self.attributes.keys())

        for field in custom_fields:
            yield field, self.get_attribute_value(field)

    def has_attribute(self, name):
        """Determines whether the detection has an attribute with the given
        name.

        The specified attribute may either exist in the :attr:`attributes` dict
        or as a dynamic instance attribute.

        Args:
            name: the attribute name

        Returns:
            True/False
        """
        # pylint: disable=unsupported-membership-test
        return name in self.attributes or hasattr(self, name)

    def get_attribute_value(self, name, default=no_default):
        """Gets the value of the attribute with the given name.

        The specified attribute may either exist in the :attr:`attributes` dict
        or as a dynamic instance attribute.

        Args:
            name: the attribute name
            default (no_default): the default value to return if the attribute
                does not exist. Can be ``None``

        Returns:
            the attribute value

        Raises:
            AttributeError: if the attribute does not exist and no default
                value was provided
        """
        try:
            return getattr(self, name)
        except AttributeError:
            pass

        try:
            # pylint: disable=unsubscriptable-object
            return self.attributes[name].value
        except KeyError:
            pass

        if default is not no_default:
            return default

        raise AttributeError(
            "%s has no attribute '%s'" % (self.__class__.__name__, name)
        )


class _HasID(Label):
    """Mixin for :class:`Label` classes that expose a UUID via an ``id``
    property, as well as a ``tags`` attribute.
    """

    meta = {"allow_inheritance": True}

    _id = fof.ObjectIdField(default=ObjectId, required=True, unique=True)
    tags = fof.ListField(fof.StringField())

    @property
    def id(self):
        """The ID of the label."""
        return str(self._id)

    def _get_repr_fields(self):
        # pylint: disable=no-member
        return ("id",) + self._fields_ordered


class _HasLabelList(object):
    """Mixin for :class:`Label` classes that contain a list of :class:`Label`
    instances.

    The ``_LABEL_LIST_FIELD`` attribute must be defined to specify the name of
    the field that contains the :class:`Label` elements.
    """

    _LABEL_LIST_FIELD = None


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
        confidence (None): a confidence in ``[0, 1]`` for the classification
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
                name, self.label, confidence=self.confidence, tags=self.tags
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


class Classifications(ImageLabel, _HasLabelList):
    """A list of classifications (typically from a multilabel model) in an
    image.

    Args:
        classifications (None): a list of :class:`Classification` instances
    """

    _LABEL_LIST_FIELD = "classifications"

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
                    tags=classification.tags,
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
        confidence (None): a confidence in ``[0, 1]`` for the detection
        index (None): an index for the object
        attributes ({}): a dict mapping attribute names to :class:`Attribute`
            instances
    """

    meta = {"allow_inheritance": True}

    label = fof.StringField()
    bounding_box = fof.ListField(fof.FloatField())
    mask = fof.ArrayField()
    confidence = fof.FloatField()
    index = fof.IntField()

    def to_polyline(self, tolerance=2, filled=True):
        """Returns a :class:`Polyline` representation of this instance.

        If the detection has a mask, the returned polyline will trace the
        boundary of the mask; otherwise, the polyline will trace the bounding
        box itself.

        Args:
            tolerance (2): a tolerance, in pixels, when generating an
                approximate polyline for the instance mask. Typical values are
                1-3 pixels
            filled (True): whether the polyline should be filled

        Returns:
            a :class:`Polyline`
        """
        dobj = self.to_detected_object()
        polyline = etai.convert_object_to_polygon(
            dobj, tolerance=tolerance, filled=filled
        )
        return Polyline.from_eta_polyline(polyline)

    def to_segmentation(self, mask=None, frame_size=None, target=255):
        """Returns a :class:`Segmentation` representation of this instance.

        The detection must have an instance mask, i.e., its :attr:`mask`
        attribute must be populated.

        You must provide either ``mask`` or ``frame_size`` to use this method.

        Args:
            mask (None): an optional 2D integer numpy array to use as an
                initial mask to which to add this object
            frame_size (None): the ``(width, height)`` of the segmentation
                mask to render. This parameter has no effect if a ``mask`` is
                provided
            target (255): the pixel value to use to render the object

        Returns:
            a :class:`Segmentation`
        """
        if self.mask is None:
            raise ValueError(
                "Only detections with their `mask` attributes populated can "
                "be converted to segmentations"
            )

        mask, _ = _parse_to_segmentation_inputs(mask, frame_size, None)
        _render_instance(mask, self, target)
        return Segmentation(mask=mask)

    def to_shapely(self, frame_size=None):
        """Returns a Shapely representation of this instance.

        Args:
            frame_size (None): the ``(width, height)`` of the image. If
                provided, the returned geometry will use absolute coordinates

        Returns:
            a ``shapely.geometry.polygon.Polygon``
        """
        # pylint: disable=unpacking-non-sequence
        x, y, w, h = self.bounding_box

        if frame_size is not None:
            width, height = frame_size
            x *= width
            y *= height
            w *= width
            h *= height

        return sg.box(x, y, x + w, y + h)

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

        attrs = _to_eta_attributes(self)

        return etao.DetectedObject(
            label=label,
            index=index,
            bounding_box=bounding_box,
            mask=mask,
            confidence=confidence,
            name=name,
            attrs=attrs,
            tags=self.tags,
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
            tags=dobj.tags,
            **attributes,
        )


class Detections(ImageLabel, _HasLabelList):
    """A list of object detections in an image.

    Args:
        detections (None): a list of :class:`Detection` instances
    """

    _LABEL_LIST_FIELD = "detections"

    meta = {"allow_inheritance": True}

    detections = fof.ListField(fof.EmbeddedDocumentField(Detection))

    def to_polylines(self, tolerance=2, filled=True):
        """Returns a :class:`Polylines` representation of this instance.

        For detections with masks, the returned polylines will trace the
        boundaries of the masks; otherwise, the polylines will trace the
        bounding boxes themselves.

        Args:
            tolerance (2): a tolerance, in pixels, when generating approximate
                polylines for the instance masks
            filled (True): whether the polylines should be filled

        Returns:
            a :class:`Polylines`
        """
        # pylint: disable=not-an-iterable
        return Polylines(
            polylines=[
                d.to_polyline(tolerance=tolerance, filled=filled)
                for d in self.detections
            ]
        )

    def to_segmentation(self, mask=None, frame_size=None, mask_targets=None):
        """Returns a :class:`Segmentation` representation of this instance.

        Only detections with instance masks (i.e., their :attr:`mask`
        attributes populated) will be rendered.

        You must provide either ``mask`` or ``frame_size`` to use this method.

        Args:
            mask (None): an optional 2D integer numpy array to use as an
                initial mask to which to add objects
            frame_size (None): the ``(width, height)`` of the segmentation
                mask to render. This parameter has no effect if a ``mask`` is
                provided
            mask_targets (None): a dict mapping integer pixel values in
                ``[0, 255]`` to label strings defining which object classes to
                render and which pixel values to use for each class. If
                omitted, all objects are rendered with pixel value 255

        Returns:
            a :class:`Segmentation`
        """
        mask, labels_to_targets = _parse_to_segmentation_inputs(
            mask, frame_size, mask_targets
        )

        # pylint: disable=not-an-iterable
        for detection in self.detections:
            if detection.mask is None:
                msg = "Skipping detection(s) with no instance mask"
                warnings.warn(msg)
                continue

            if labels_to_targets is not None:
                target = labels_to_targets.get(detection.label, None)
                if target is None:
                    continue
            else:
                target = 255

            _render_instance(mask, detection, target)

        return Segmentation(mask=mask)

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
    """A set of semantically related polylines or polygons.

    Args:
        label (None): a label for the polyline
        points (None): a list of lists of ``(x, y)`` points in
            ``[0, 1] x [0, 1]`` describing the vertices of each shape in the
            polyline
        confidence (None): a confidence in ``[0, 1]`` for the polyline
        index (None): an index for the polyline
        closed (False): whether the shapes are closed, i.e., and edge should
            be drawn from the last vertex to the first vertex of each shape
        filled (False): whether the polyline represents polygons, i.e., shapes
            that should be filled when rendering them
        attributes ({}): a dict mapping attribute names to :class:`Attribute`
            instances for the polyline
    """

    meta = {"allow_inheritance": True}

    label = fof.StringField()
    points = fof.PolylinePointsField()
    confidence = fof.FloatField()
    index = fof.IntField()
    closed = fof.BooleanField(default=False)
    filled = fof.BooleanField(default=False)

    def to_detection(self, mask_size=None):
        """Returns a :class:`Detection` representation of this instance whose
        bounding box tightly encloses the polyline.

        If a ``mask_size`` is provided, an instance mask of the specified size
        encoding the polyline's shape is included.

        Args:
            mask_size (None): an optional ``(width, height)`` at which to
                render an instance mask for the polyline

        Returns:
            a :class:`Detection`
        """
        polyline = self.to_eta_polyline()
        if mask_size is not None:
            bbox, mask = etai.render_bounding_box_and_mask(polyline, mask_size)
        else:
            bbox = etai.render_bounding_box(polyline)
            mask = None

        xtl, ytl, xbr, ybr = bbox.to_coords()
        bounding_box = [xtl, ytl, (xbr - xtl), (ybr - ytl)]

        attributes = dict(self.iter_attributes())

        return Detection(
            label=self.label,
            bounding_box=bounding_box,
            confidence=self.confidence,
            mask=mask,
            index=self.index,
            tags=self.tags,
            **attributes,
        )

    def to_segmentation(
        self, mask=None, frame_size=None, target=255, thickness=1
    ):
        """Returns a :class:`Segmentation` representation of this instance.

        You must provide either ``mask`` or ``frame_size`` to use this method.

        Args:
            mask (None): an optional 2D integer numpy array to use as an
                initial mask to which to add objects
            frame_size (None): the ``(width, height)`` of the segmentation
                mask to render. This parameter has no effect if a ``mask`` is
                provided
            target (255): the pixel value to use to render the object
            thickness (1): the thickness, in pixels, at which to render
                (non-filled) polylines

        Returns:
            a :class:`Segmentation`
        """
        mask, _ = _parse_to_segmentation_inputs(mask, frame_size, None)
        _render_polyline(mask, self, target, thickness)
        return Segmentation(mask=mask)

    def to_shapely(self, frame_size=None):
        """Returns a Shapely representation of this instance.

        The type of geometry returned depends on the number of shapes
        (:attr:`points`) and whether they are polygons or lines
        (:attr:`filled`).

        Args:
            frame_size (None): the ``(width, height)`` of the image. If
                provided, the returned geometry will use absolute coordinates

        Returns:
            one of the following:

            -   ``shapely.geometry.polygon.Polygon``: if :attr:`filled` is True
                and :attr:`points` contains a single shape
            -   ``shapely.geometry.multipolygon.MultiPolygon``: if
                :attr:`filled` is True and :attr:`points` contains multiple
                shapes
            -   ``shapely.geometry.linestring.LineString``: if :attr:`filled`
                is False and :attr:`points` contains a single shape
            -   ``shapely.geometry.multilinestring.MultiLineString``: if
                :attr:`filled` is False and :attr:`points` contains multiple
                shapes
        """
        if self.closed:
            points = []
            for shape in self.points:  # pylint: disable=not-an-iterable
                if shape:
                    shape = list(shape) + [shape[0]]

                points.append(shape)
        else:
            points = self.points

        if frame_size is not None:
            w, h = frame_size
            points = [[(x * w, y * h) for x, y in shape] for shape in points]

        if len(points) == 1:
            if self.filled:
                return sg.Polygon(points[0])

            return sg.LineString(points[0])

        if self.filled:
            return sg.MultiPolygon(list(zip(points, itertools.repeat(None))))

        return sg.MultiLineString(points)

    def to_eta_polyline(self, name=None):
        """Returns an ``eta.core.polylines.Polyline`` representation of this
        instance.

        Args:
            name (None): the name of the label field

        Returns:
            an ``eta.core.polylines.Polyline``
        """
        attrs = _to_eta_attributes(self)

        return etap.Polyline(
            label=self.label,
            confidence=self.confidence,
            index=self.index,
            name=name,
            points=self.points,
            closed=self.closed,
            filled=self.filled,
            attrs=attrs,
            tags=self.tags,
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
            confidence=polyline.confidence,
            index=polyline.index,
            closed=polyline.closed,
            filled=polyline.filled,
            tags=polyline.tags,
            **attributes,
        )


class Polylines(ImageLabel, _HasLabelList):
    """A list of polylines or polygons in an image.

    Args:
        polylines (None): a list of :class:`Polyline` instances
    """

    _LABEL_LIST_FIELD = "polylines"

    meta = {"allow_inheritance": True}

    polylines = fof.ListField(fof.EmbeddedDocumentField(Polyline))

    def to_detections(self, mask_size=None):
        """Returns a :class:`Detections` representation of this instance whose
        bounding boxes tightly enclose the polylines.

        If a ``mask_size`` is provided, instance masks of the specified size
        encoding the polyline's shape are included in each :class:`Detection`.

        Args:
            mask_size (None): an optional ``(width, height)`` at which to
                render instance masks for the polylines

        Returns:
            a :class:`Detections`
        """
        # pylint: disable=not-an-iterable
        return Detections(
            detections=[
                p.to_detection(mask_size=mask_size) for p in self.polylines
            ]
        )

    def to_segmentation(
        self, mask=None, frame_size=None, mask_targets=None, thickness=1
    ):
        """Returns a :class:`Segmentation` representation of this instance.

        You must provide either ``mask`` or ``frame_size`` to use this method.

        Args:
            mask (None): an optional 2D integer numpy array to use as an
                initial mask to which to add objects
            frame_size (None): the ``(width, height)`` of the segmentation
                mask to render. This parameter has no effect if a ``mask`` is
                provided
            mask_targets (None): a dict mapping integer pixel values in
                ``[0, 255]`` to label strings defining which object classes to
                render and which pixel values to use for each class. If
                omitted, all objects are rendered with pixel value 255
            thickness (1): the thickness, in pixels, at which to render
                (non-filled) polylines

        Returns:
            a :class:`Segmentation`
        """
        mask, labels_to_targets = _parse_to_segmentation_inputs(
            mask, frame_size, mask_targets
        )

        # pylint: disable=not-an-iterable
        for polyline in self.polylines:
            if labels_to_targets is not None:
                target = labels_to_targets.get(polyline.label, None)
                if target is None:
                    continue
            else:
                target = 255

            _render_polyline(mask, polyline, target, thickness)

        return Segmentation(mask=mask)

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
        confidence (None): a confidence in ``[0, 1]`` for the points
        index (None): an index for the keypoints
        attributes ({}): a dict mapping attribute names to :class:`Attribute`
            instances
    """

    meta = {"allow_inheritance": True}

    label = fof.StringField()
    points = fof.KeypointsField()
    confidence = fof.FloatField()
    index = fof.IntField()

    def to_shapely(self, frame_size=None):
        """Returns a Shapely representation of this instance.

        Args:
            frame_size (None): the ``(width, height)`` of the image. If
                provided, the returned geometry will use absolute coordinates

        Returns:
            a ``shapely.geometry.multipoint.MultiPoint``
        """
        # pylint: disable=not-an-iterable
        points = self.points

        if frame_size is not None:
            w, h = frame_size
            points = [(x * w, y * h) for x, y in points]

        return sg.MultiPoint(points)

    def to_eta_keypoints(self, name=None):
        """Returns an ``eta.core.keypoints.Keypoints`` representation of this
        instance.

        Args:
            name (None): the name of the label field

        Returns:
            an ``eta.core.keypoints.Keypoints``
        """
        attrs = _to_eta_attributes(self)

        return etak.Keypoints(
            name=name,
            label=self.label,
            confidence=self.confidence,
            index=self.index,
            points=self.points,
            attrs=attrs,
            tags=self.tags,
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
            confidence=keypoints.confidence,
            index=keypoints.index,
            tags=keypoints.tags,
            **attributes,
        )


class Keypoints(ImageLabel, _HasLabelList):
    """A list of :class:`Keypoint` instances in an image.

    Args:
        keypoints (None): a list of :class:`Keypoint` instances
    """

    _LABEL_LIST_FIELD = "keypoints"

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


class Segmentation(ImageLabel, _HasID):
    """A semantic segmentation mask for an image.

    Args:
        mask (None): a semantic segmentation mask, which should be a NumPy
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
        return etai.ImageLabels(mask=self.mask, tags=self.tags)

    @classmethod
    def from_mask(cls, mask):
        """Creates a :class:`Segmentation` instance from a mask.

        Args:
            mask: a semantic segmentation mask

        Returns:
            a :class:`Segmentation`
        """
        return cls(mask=mask)


class GeoLocation(ImageLabel, _HasID):
    """Location data in GeoJSON format.

    Args:
        point (None): a ``[longitude, latitude]`` point
        line (None): a line defined by coordinates as shown below::

                [[lon1, lat1], [lon2, lat2], ...]

        polygon (None): a polygon defined by coorindates as shown below::

                [
                    [[lon1, lat1], [lon2, lat2], ...],
                    [[lon1, lat1], [lon2, lat2], ...],
                    ...
                ]

            where the first outer list describes the boundary of the polygon
            and any remaining entries describe holes
    """

    meta = {"allow_inheritance": True}

    point = fof.GeoPointField(auto_index=False)
    line = fof.GeoLineStringField(auto_index=False)
    polygon = fof.GeoPolygonField(auto_index=False)

    def to_geo_json(self):
        """Returns a GeoJSON ``geometry`` dict for this instance.

        Returns:
            a GeoJSON dict
        """
        return foug.to_geo_json_geometry(self)

    @classmethod
    def from_geo_json(cls, d):
        """Creates a :class:`GeoLocation` from a GeoJSON dictionary.

        Args:
            d: a GeoJSON dict

        Returns:
            a :class:`GeoLocation`
        """
        point, line, polygon = _from_geo_json_single(d)
        return cls(point=point, line=line, polygon=polygon)


class GeoLocations(ImageLabel, _HasID):
    """A batch of location data in GeoJSON format.

    The attributes of this class accept lists of data in the format of the
    corresponding attributes of :class:`GeoLocation`.

    Args:
        points (None): a list of points
        lines (None): a list of lines
        polygons (None): a list of polygons
    """

    meta = {"allow_inheritance": True}

    points = fof.GeoMultiPointField(auto_index=False)
    lines = fof.GeoMultiLineStringField(auto_index=False)
    polygons = fof.GeoMultiPolygonField(auto_index=False)

    def to_geo_json(self):
        """Returns a GeoJSON ``geometry`` dict for this instance.

        Returns:
            a GeoJSON dict
        """
        return foug.to_geo_json_geometry(self)

    @classmethod
    def from_geo_json(cls, d):
        """Creates a :class:`GeoLocation` from a GeoJSON dictionary.

        Args:
            d: a GeoJSON dict

        Returns:
            a :class:`GeoLocation`
        """
        points, lines, polygons = _from_geo_json(d)
        return cls(points=points, lines=lines, polygons=polygons)


_SINGLE_LABEL_FIELDS = (
    Classification,
    Detection,
    GeoLocation,
    Keypoint,
    Polyline,
    Segmentation,
)

_LABEL_LIST_FIELDS = (
    Classifications,
    Detections,
    Keypoints,
    Polylines,
)

_LABEL_FIELDS = _SINGLE_LABEL_FIELDS + _LABEL_LIST_FIELDS

_PATCHES_FIELDS = (
    Detection,
    Detections,
    Polyline,
    Polylines,
)

_LABEL_LIST_TO_SINGLE_MAP = {
    Classifications: Classification,
    Detections: Detection,
    Keypoints: Keypoint,
    Polylines: Polyline,
}


def _parse_to_segmentation_inputs(mask, frame_size, mask_targets):
    if mask is None:
        if frame_size is None:
            raise ValueError("Either `mask` or `frame_size` must be provided")

        width, height = frame_size
        mask = np.zeros((height, width), dtype=np.uint8)
    else:
        height, width = mask.shape[:2]

    if mask_targets is not None:
        labels_to_targets = {label: idx for idx, label in mask_targets.items()}
    else:
        labels_to_targets = None

    return mask, labels_to_targets


def _render_instance(mask, detection, target):
    dobj = detection.to_detected_object()
    obj_mask, offset = etai.render_instance_mask(
        dobj.mask, dobj.bounding_box, img=mask
    )

    x0, y0 = offset
    dh, dw = obj_mask.shape

    patch = mask[y0 : (y0 + dh), x0 : (x0 + dw)]
    patch[obj_mask] = target
    mask[y0 : (y0 + dh), x0 : (x0 + dw)] = patch


def _render_polyline(mask, polyline, target, thickness):
    points = polyline.to_eta_polyline().coords_in(img=mask)
    points = [np.array(shape, dtype=np.int32) for shape in points]

    if polyline.filled:
        # pylint: disable=no-member
        mask = cv2.fillPoly(mask, points, target)
    else:
        mask = cv2.polylines(  # pylint: disable=no-member
            mask, points, polyline.closed, target, thickness=thickness
        )


def _from_geo_json_single(d):
    points, lines, polygons = _from_geo_json(d)

    if not points:
        point = None
    elif len(points) == 1:
        point = points[0]
    else:
        raise ValueError(
            "%s can contain only one point. Use %s to store multiple "
            "points" % (GeoLocation, GeoLocations)
        )

    if not lines:
        line = None
    elif len(lines) == 1:
        line = lines[0]
    else:
        raise ValueError(
            "%s can contain only one line. Use %s to store multiple lines"
            % (GeoLocation, GeoLocations)
        )

    if not polygons:
        polygon = None
    elif len(polygons) == 1:
        polygon = polygons[0]
    else:
        raise ValueError(
            "%s can contain only one polygon. Use %s to store multiple "
            "polygons" % (GeoLocation, GeoLocations)
        )

    return point, line, polygon


def _from_geo_json(d):
    points, lines, polygons = foug.extract_coordinates(d)

    if not points:
        points = None

    if not lines:
        lines = None

    if not polygons:
        polygons = None

    return points, lines, polygons


def _from_eta_attributes(attrs):
    return {a.name: a.value for a in attrs}


def _to_eta_attributes(label):
    attrs = etad.AttributeContainer()
    for name, value in label.iter_attributes():
        if etau.is_str(value):
            _attr = etad.CategoricalAttribute(name, value)
        elif etau.is_numeric(value):
            _attr = etad.NumericAttribute(name, value)
        elif isinstance(value, bool):
            _attr = etad.BooleanAttribute(name, value)
        elif value is None:
            continue
        else:
            msg = "Ignoring unsupported attribute type '%s'" % type(value)
            warnings.warn(msg)
            continue

        attrs.add(_attr)

    return attrs
