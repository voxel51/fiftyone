"""
Labels stored in dataset samples.

| Copyright 2017-2022, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""
import itertools
import warnings

from bson import ObjectId
import cv2
import numpy as np

import eta.core.frameutils as etaf
import eta.core.image as etai

from fiftyone.core.odm import DynamicEmbeddedDocument
import fiftyone.core.fields as fof
import fiftyone.core.metadata as fom
import fiftyone.core.utils as fou

foue = fou.lazy_import("fiftyone.utils.eta")
foug = fou.lazy_import("fiftyone.utils.geojson")
sg = fou.lazy_import(
    "shapely.geometry", callback=lambda: fou.ensure_package("shapely")
)


class _NoDefault(object):
    pass


no_default = _NoDefault()


class Label(DynamicEmbeddedDocument):
    """Base class for labels.

    Label instances represent a logical collection of data associated with a
    particular task for a sample or frame in a dataset.
    """

    def iter_attributes(self):
        """Returns an iterator over the custom attributes of the label.

        Returns:
            a generator that emits ``(name, value)`` tuples
        """
        # pylint: disable=no-member
        custom_fields = set(self._fields_ordered) - set(self._fields.keys())

        for field in custom_fields:
            yield field, self.get_attribute_value(field)

    def has_attribute(self, name):
        """Determines whether the label has an attribute with the given name.

        Args:
            name: the attribute name

        Returns:
            True/False
        """
        return hasattr(self, name)

    def get_attribute_value(self, name, default=no_default):
        """Gets the value of the attribute with the given name.

        Args:
            name: the attribute name
            default (no_default): a default value to return if the attribute
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

        if default is not no_default:
            return default

        raise AttributeError(
            "%s has no attribute '%s'" % (self.__class__.__name__, name)
        )

    def set_attribute_value(self, name, value):
        """Sets the value of the attribute with the given name.

        The attribute will be declared if it does not exist.

        Args:
            name: the attribute name
            value: the value
        """
        setattr(self, name, value)

    def delete_attribute(self, name):
        """Deletes the attribute with the given name.

        Args:
            name: the attribute name

        Raises:
            AttributeError: if the attribute does not exist
        """
        try:
            delattr(self, name)
        except AttributeError:
            raise AttributeError(
                "%s has no attribute '%s'" % (self.__class__.__name__, name)
            )


# @todo remove this in favor of dynamic-only attributes
class Attribute(DynamicEmbeddedDocument):
    """Base class for attributes.

    Attribute instances represent an atomic piece of information, its
    ``value``, usually embedded with a ``name`` within a dict field of another
    :class:`Label` instance.

    Args:
        value (None): the attribute value
    """

    value = fof.Field()


# @todo remove this in favor of dynamic-only attributes
class BooleanAttribute(Attribute):
    """A boolean attribute.

    Args:
        value (None): the attribute value
    """

    value = fof.BooleanField()


# @todo remove this in favor of dynamic-only attributes
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


# @todo remove this in favor of dynamic-only attributes
class NumericAttribute(Attribute):
    """A numeric attribute.

    Args:
        value (None): the attribute value
    """

    value = fof.FloatField()


# @todo remove this in favor of dynamic-only attributes
class ListAttribute(Attribute):
    """A list attribute.

    The list can store arbitrary JSON-serialiable values.

    Args:
        value (None): the attribute value
    """

    value = fof.ListField()


# @todo remove this in favor of dynamic-only attributes
class _HasAttributesDict(Label):
    """Mixin for :class:`Label` classes that have an :attr:`attributes` field
    that contains a dict of of :class:`Attribute` instances.
    """

    attributes = fof.DictField(fof.EmbeddedDocumentField(Attribute))

    def iter_attributes(self):
        """Returns an iterator over the custom attributes of the label.

        Attribute may either exist in the :attr:`attributes` dict or as dynamic
        attributes.

        Returns:
            a generator that emits ``(name, value)`` tuples
        """
        # pylint: disable=no-member
        custom_fields = set(self._fields_ordered) - set(self._fields.keys())
        custom_fields.update(self.attributes.keys())

        for field in custom_fields:
            yield field, self.get_attribute_value(field)

    def has_attribute(self, name):
        """Determines whether the label has an attribute with the given name.

        The specified attribute may either exist in the :attr:`attributes` dict
        or as a dynamic attribute.

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
        or as a dynamic attribute.

        Args:
            name: the attribute name
            default (no_default): a default value to return if the attribute
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

    def set_attribute_value(self, name, value):
        """Sets the value of the attribute with the given name.

        If the specified attribute already exists in the :attr:`attributes`
        dict, its value is updated there. Otherwise, the attribute is
        set (or created) as a dynamic attribute.

        Args:
            name: the attribute name
            value: the value
        """
        # pylint: disable=unsupported-membership-test
        if name in self.attributes:
            # pylint: disable=unsubscriptable-object
            self.attributes[name].value = value
        else:
            setattr(self, name, value)

    def delete_attribute(self, name):
        """Deletes the attribute with the given name.

        The specified attribute may either exist in the :attr:`attributes` dict
        or as a dynamic attribute.

        Args:
            name: the attribute name

        Raises:
            AttributeError: if the attribute does not exist
        """
        # pylint: disable=unsupported-membership-test
        if name in self.attributes:
            # pylint: disable=unsupported-delete-operation
            try:
                del self.attributes[name]
            except KeyError:
                raise AttributeError(
                    "%s has no attribute '%s'"
                    % (self.__class__.__name__, name)
                )
        else:
            try:
                delattr(self, name)
            except AttributeError:
                raise AttributeError(
                    "%s has no attribute '%s'"
                    % (self.__class__.__name__, name)
                )


class _HasID(Label):
    """Mixin for :class:`Label` classes that expose a UUID via an ``id``
    property, as well as a ``tags`` attribute.
    """

    id = fof.ObjectIdField(
        default=ObjectId, required=True, unique=True, db_field="_id"
    )
    tags = fof.ListField(fof.StringField())

    @property
    def _id(self):
        return ObjectId(self.id)

    def _get_repr_fields(self):
        # pylint: disable=no-member
        return self._fields_ordered


class _HasLabelList(object):
    """Mixin for :class:`Label` classes that contain a list of :class:`Label`
    instances.

    The ``_LABEL_LIST_FIELD`` attribute must be defined to specify the name of
    the field that contains the :class:`Label` elements.
    """

    _LABEL_LIST_FIELD = None


class Regression(_HasID, Label):
    """A regression value.

    Args:
        value (None): the regression value
        confidence (None): a confidence in ``[0, 1]`` for the regression
    """

    value = fof.FloatField()
    confidence = fof.FloatField()


class Classification(_HasID, Label):
    """A classification label.

    Args:
        label (None): the label string
        confidence (None): a confidence in ``[0, 1]`` for the classification
        logits (None): logits associated with the labels
    """

    label = fof.StringField()
    confidence = fof.FloatField()
    logits = fof.VectorField()


class Classifications(_HasLabelList, Label):
    """A list of classifications for an image.

    Args:
        classifications (None): a list of :class:`Classification` instances
    """

    _LABEL_LIST_FIELD = "classifications"

    classifications = fof.ListField(fof.EmbeddedDocumentField(Classification))
    logits = fof.VectorField()


class Detection(_HasID, _HasAttributesDict, Label):
    """An object detection.

    Args:
        label (None): the label string
        bounding_box (None): a list of relative bounding box coordinates in
            ``[0, 1]`` in the following format::

            [<top-left-x>, <top-left-y>, <width>, <height>]

        mask (None): an instance segmentation mask for the detection within
            its bounding box, which should be a 2D binary or 0/1 integer numpy
            array
        confidence (None): a confidence in ``[0, 1]`` for the detection
        index (None): an index for the object
        attributes ({}): a dict mapping attribute names to :class:`Attribute`
            instances
    """

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
        dobj = foue.to_detected_object(self, extra_attrs=False)
        polyline = etai.convert_object_to_polygon(
            dobj, tolerance=tolerance, filled=filled
        )

        attributes = dict(self.iter_attributes())

        return Polyline(
            label=self.label,
            points=polyline.points,
            confidence=self.confidence,
            index=self.index,
            closed=polyline.closed,
            filled=polyline.filled,
            tags=self.tags,
            **attributes,
        )

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

    @classmethod
    def from_mask(cls, mask, label, **attributes):
        """Creates a :class:`Detection` instance with its ``mask`` attribute
        populated from the given full image mask.

        The instance mask for the object is extracted by computing the bounding
        rectangle of the non-zero values in the image mask.

        Args:
            mask: a boolean or 0/1 numpy array
            label: the label string
            **attributes: additional attributes for the :class:`Detection`

        Returns:
            a :class:`Detection`
        """
        if mask.ndim > 2:
            mask = mask[:, :, 0]

        bbox, mask = _parse_stuff_instance(mask.astype(bool))

        return cls(label=label, bounding_box=bbox, mask=mask, **attributes)


class Detections(_HasLabelList, Label):
    """A list of object detections in an image.

    Args:
        detections (None): a list of :class:`Detection` instances
    """

    _LABEL_LIST_FIELD = "detections"

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
            mask_targets (None): a dict mapping integer pixel values to label
                strings defining which object classes to render and which pixel
                values to use for each class. If omitted, all objects are
                rendered with pixel value 255

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
                    continue  # skip unknown target
            else:
                target = 255

            _render_instance(mask, detection, target)

        return Segmentation(mask=mask)


class Polyline(_HasID, _HasAttributesDict, Label):
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

    label = fof.StringField()
    points = fof.PolylinePointsField()
    confidence = fof.FloatField()
    index = fof.IntField()
    closed = fof.BooleanField(default=False)
    filled = fof.BooleanField(default=False)

    def to_detection(self, mask_size=None, frame_size=None):
        """Returns a :class:`Detection` representation of this instance whose
        bounding box tightly encloses the polyline.

        If a ``mask_size`` is provided, an instance mask of the specified size
        encoding the polyline's shape is included.

        Alternatively, if a ``frame_size`` is provided, the required mask size
        is then computed based off of the polyline points and ``frame_size``.

        Args:
            mask_size (None): an optional ``(width, height)`` at which to
                render an instance mask for the polyline
            frame_size (None): used when no ``mask_size`` is provided.
                an optional ``(width, height)`` of the frame containing this
                polyline that is used to compute the required ``mask_size``

        Returns:
            a :class:`Detection`
        """
        polyline = foue.to_polyline(self, extra_attrs=False)
        if mask_size is not None:
            bbox, mask = etai.render_bounding_box_and_mask(polyline, mask_size)
        else:
            bbox = etai.render_bounding_box(polyline)
            mask = None

        xtl, ytl, xbr, ybr = bbox.to_coords()
        bounding_box = [xtl, ytl, (xbr - xtl), (ybr - ytl)]

        if mask_size is None and frame_size:
            w, h = frame_size
            rel_mask_w = bounding_box[2]
            rel_mask_h = bounding_box[3]
            abs_mask_w = int(round(rel_mask_w * w))
            abs_mask_h = int(round(rel_mask_h * h))
            mask_size = (abs_mask_w, abs_mask_h)
            _, mask = etai.render_bounding_box_and_mask(polyline, mask_size)

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

    @classmethod
    def from_mask(cls, mask, label, tolerance=2, **attributes):
        """Creates a :class:`Polyline` instance with polygons describing the
        non-zero region(s) of the given full image mask.

        Args:
            mask: a boolean or 0/1 numpy array
            label: the label string
            tolerance (2): a tolerance, in pixels, when generating approximate
                polygons for each region. Typical values are 1-3 pixels
            **attributes: additional attributes for the :class:`Polyline`

        Returns:
            a :class:`Polyline`
        """
        if mask.ndim > 2:
            mask = mask[:, :, 0]

        points = _get_polygons(mask.astype(bool), tolerance)

        return cls(
            label=label, points=points, filled=True, closed=True, **attributes
        )


class Polylines(_HasLabelList, Label):
    """A list of polylines or polygons in an image.

    Args:
        polylines (None): a list of :class:`Polyline` instances
    """

    _LABEL_LIST_FIELD = "polylines"

    polylines = fof.ListField(fof.EmbeddedDocumentField(Polyline))

    def to_detections(self, mask_size=None, frame_size=None):
        """Returns a :class:`Detections` representation of this instance whose
        bounding boxes tightly enclose the polylines.

        If a ``mask_size`` is provided, instance masks of the specified size
        encoding the polyline's shape are included in each :class:`Detection`.

        Alternatively, if a ``frame_size`` is provided, the required mask size
        is then computed based off of the polyline points and ``frame_size``.

        Args:
            mask_size (None): an optional ``(width, height)`` at which to
                render instance masks for the polylines
            frame_size (None): used when no ``mask_size`` is provided.
                an optional ``(width, height)`` of the frame containing these
                polylines that is used to compute the required ``mask_size``

        Returns:
            a :class:`Detections`
        """
        # pylint: disable=not-an-iterable
        return Detections(
            detections=[
                p.to_detection(mask_size=mask_size, frame_size=frame_size)
                for p in self.polylines
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
            mask_targets (None): a dict mapping integer pixel values to label
                strings defining which object classes to render and which
                pixel values to use for each class. If omitted, all objects are
                rendered with pixel value 255
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
                    continue  # skip unknown target
            else:
                target = 255

            _render_polyline(mask, polyline, target, thickness)

        return Segmentation(mask=mask)


class Keypoint(_HasID, _HasAttributesDict, Label):
    """A list of keypoints in an image.

    Args:
        label (None): a label for the points
        points (None): a list of ``(x, y)`` keypoints in ``[0, 1] x [0, 1]``
        confidence (None): a list of confidences in ``[0, 1]`` for each point
        index (None): an index for the keypoints
        attributes ({}): a dict mapping attribute names to :class:`Attribute`
            instances
    """

    label = fof.StringField()
    points = fof.KeypointsField()
    confidence = fof.ListField(fof.FloatField(), null=True)
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


class Keypoints(_HasLabelList, Label):
    """A list of :class:`Keypoint` instances in an image.

    Args:
        keypoints (None): a list of :class:`Keypoint` instances
    """

    _LABEL_LIST_FIELD = "keypoints"

    keypoints = fof.ListField(fof.EmbeddedDocumentField(Keypoint))


class Segmentation(_HasID, Label):
    """A semantic segmentation for an image.

    Args:
        mask (None): a 2D numpy array with integer values encoding the semantic
            labels
    """

    mask = fof.ArrayField()

    def to_detections(self, mask_targets=None, mask_types="stuff"):
        """Returns a :class:`Detections` representation of this instance with
        instance masks populated.

        Each ``"stuff"`` class will be converted to a single :class:`Detection`
        whose instance mask spans all region(s) of the class.

        Each ``"thing"`` class will result in one :class:`Detection` instance
        per connected region of that class in the segmentation.

        Args:
            mask_targets (None): a dict mapping integer pixel values to label
                strings defining which classes to generate detections for. If
                omitted, all labels are assigned to the integer pixel values
            mask_types ("stuff"): whether the classes are ``"stuff"``
                (amorphous regions of pixels) or ``"thing"`` (connected
                regions, each representing an instance of the thing). Can be
                any of the following:

                -   ``"stuff"`` if all classes are stuff classes
                -   ``"thing"`` if all classes are thing classes
                -   a dict mapping pixel values to ``"stuff"`` or ``"thing"``
                    for each class

        Returns:
            a :class:`Detections`
        """
        detections = _segmentation_to_detections(
            self, mask_targets, mask_types
        )
        return Detections(detections=detections)

    def to_polylines(self, mask_targets=None, mask_types="stuff", tolerance=2):
        """Returns a :class:`Polylines` representation of this instance.

        Each ``"stuff"`` class will be converted to a single :class:`Polyline`
        that may contain multiple disjoint shapes capturing the class.

        Each ``"thing"`` class will result in one :class:`Polyline` instance
        per connected region of that class.

        Args:
            mask_targets (None): a dict mapping integer pixel values to label
                strings defining which object classes to generate polylines
                for. If omitted, all labels are assigned to the integer pixel
                values
            mask_types ("stuff"): whether the classes are ``"stuff"``
                (amorphous regions of pixels) or ``"thing"`` (connected
                regions, each representing an instance of the thing). Can be
                any of the following:

                -   ``"stuff"`` if all classes are stuff classes
                -   ``"thing"`` if all classes are thing classes
                -   a dict mapping pixel values to ``"stuff"`` or ``"thing"``
                    for each class
            tolerance (2): a tolerance, in pixels, when generating approximate
                polylines for each region. Typical values are 1-3 pixels

        Returns:
            a :class:`Polylines`
        """
        polylines = _segmentation_to_polylines(
            self, mask_targets, mask_types, tolerance
        )
        return Polylines(polylines=polylines)


class Heatmap(_HasID, Label):
    """A heatmap for an image.

    Args:
        map (None): a 2D numpy array
        range (None): an optional ``[min, max]`` range of the map's values. If
            None is provided, ``[0, 1]`` will be assumed if ``map`` contains
            floating point values, and ``[0, 255]`` will be assumed if ``map``
            contains integer values
    """

    map = fof.ArrayField()
    range = fof.HeatmapRangeField()


class TemporalDetection(_HasID, Label):
    """A temporal detection in a video whose support is defined by a start and
    end frame.

    Args:
        label (None): the label string
        support (None): the ``[first, last]`` frame numbers, inclusive
        confidence (None): a confidence in ``[0, 1]`` for the detection
    """

    label = fof.StringField()
    support = fof.FrameSupportField()
    confidence = fof.FloatField()

    @classmethod
    def from_timestamps(cls, timestamps, sample=None, metadata=None, **kwargs):
        """Creates a :class:`TemporalDetection` instance from ``[start, stop]``
        timestamps for the specified video.

        You must provide either ``sample`` or ``metadata`` to inform the
        conversion.

        Args:
            timestamps: the ``[start, stop]`` timestamps, in seconds or
                "HH:MM:SS.XXX" format
            sample (None): a video :class:`fiftyone.core.sample.Sample` whose
                ``metadata`` field is populated
            metadata (None): a :class:`fiftyone.core.metadata.VideoMetadata`
                instance
            **kwargs: additional arguments for :class:`TemporalDetection`

        Returns:
            a :class:`TemporalDetection`
        """
        start, end = timestamps
        total_frame_count, duration = _parse_video_metadata(sample, metadata)
        support = [
            etaf.timestamp_to_frame_number(start, duration, total_frame_count),
            etaf.timestamp_to_frame_number(end, duration, total_frame_count),
        ]
        return cls(support=support, **kwargs)

    def to_timestamps(self, sample=None, metadata=None):
        """Returns the ``[start, stop]`` timestamps, in seconds, for this
        temporal detection in the given video.

        You must provide either ``sample`` or ``metadata`` to inform the
        conversion.

        Args:
            sample (None): a video :class:`fiftyone.core.sample.Sample` whose
                ``metadata`` field is populated
            metadata (None): a :class:`fiftyone.core.metadata.VideoMetadata`
                instance

        Returns:
            the ``[start, stop]`` timestamps of this detection, in seconds
        """
        first, last = self.support  # pylint: disable=unpacking-non-sequence
        total_frame_count, duration = _parse_video_metadata(sample, metadata)
        return [
            etaf.frame_number_to_timestamp(first, total_frame_count, duration),
            etaf.frame_number_to_timestamp(last, total_frame_count, duration),
        ]


def _parse_video_metadata(sample, metadata):
    if sample is not None:
        metadata = sample.metadata

    if not isinstance(metadata, fom.VideoMetadata):
        raise ValueError(
            "You must provide either `metadata` or a `sample` whose "
            "`metadata` field is populated containing `VideoMetadata`"
        )

    return metadata.total_frame_count, metadata.duration


class TemporalDetections(_HasLabelList, Label):
    """A list of temporal detections for a video.

    Args:
        detections (None): a list of :class:`TemporalDetection`
            instances
    """

    _LABEL_LIST_FIELD = "detections"

    detections = fof.ListField(fof.EmbeddedDocumentField(TemporalDetection))


class GeoLocation(_HasID, Label):
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


class GeoLocations(_HasID, Label):
    """A batch of location data in GeoJSON format.

    The attributes of this class accept lists of data in the format of the
    corresponding attributes of :class:`GeoLocation`.

    Args:
        points (None): a list of points
        lines (None): a list of lines
        polygons (None): a list of polygons
    """

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


_LABEL_LIST_FIELDS = (
    Classifications,
    Detections,
    Keypoints,
    Polylines,
    TemporalDetections,
)

_PATCHES_FIELDS = (
    Detection,
    Detections,
    Polyline,
    Polylines,
)

_SINGLE_LABEL_TO_LIST_MAP = {
    Classification: Classifications,
    Detection: Detections,
    Keypoint: Keypoints,
    Polyline: Polylines,
    TemporalDetection: TemporalDetections,
}

_LABEL_LIST_TO_SINGLE_MAP = {
    Classifications: Classification,
    Detections: Detection,
    Keypoints: Keypoint,
    Polylines: Polyline,
    TemporalDetections: TemporalDetection,
}


def _parse_to_segmentation_inputs(mask, frame_size, mask_targets):
    if mask is None:
        if frame_size is None:
            raise ValueError("Either `mask` or `frame_size` must be provided")

        if mask_targets is not None and max(mask_targets) > 255:
            dtype = np.int
        else:
            dtype = np.uint8

        width, height = frame_size
        mask = np.zeros((height, width), dtype=dtype)
    else:
        height, width = mask.shape[:2]

    if mask_targets is not None:
        labels_to_targets = {label: idx for idx, label in mask_targets.items()}
    else:
        labels_to_targets = None

    return mask, labels_to_targets


def _render_instance(mask, detection, target):
    dobj = foue.to_detected_object(detection, extra_attrs=False)
    obj_mask, offset = etai.render_instance_mask(
        dobj.mask, dobj.bounding_box, img=mask
    )

    x0, y0 = offset
    dh, dw = obj_mask.shape

    patch = mask[y0 : (y0 + dh), x0 : (x0 + dw)]
    patch[obj_mask] = target
    mask[y0 : (y0 + dh), x0 : (x0 + dw)] = patch


def _render_polyline(mask, polyline, target, thickness):
    points = foue.to_polyline(polyline, extra_attrs=False).coords_in(img=mask)
    points = [np.array(shape, dtype=np.int32) for shape in points]

    if polyline.filled:
        # pylint: disable=no-member
        cv2.fillPoly(mask, points, target)
    else:
        cv2.polylines(  # pylint: disable=no-member
            mask, points, polyline.closed, target, thickness=thickness
        )


def _segmentation_to_detections(segmentation, mask_targets, mask_types):
    if isinstance(mask_types, dict):
        default = None
    else:
        default = mask_types
        mask_types = {}

    mask = segmentation.mask

    detections = []
    for target in np.unique(mask):
        if target == 0:
            continue  # skip background

        if mask_targets is not None:
            label = mask_targets.get(target, None)
            if label is None:
                continue  # skip unknown target
        else:
            label = str(target)

        label_type = mask_types.get(target, None)
        if label_type is None:
            if default is None:
                continue  # skip unknown type

            label_type = default

        label_mask = mask == target

        if label_type == "stuff":
            instances = [_parse_stuff_instance(label_mask)]
        elif label_type == "thing":
            instances = _parse_thing_instances(label_mask)
        else:
            raise ValueError(
                "Unsupported mask type '%s'. Supported values are "
                "('stuff', 'thing')"
            )

        for bbox, instance_mask in instances:
            detections.append(
                Detection(label=label, bounding_box=bbox, mask=instance_mask)
            )

    return detections


def _segmentation_to_polylines(
    segmentation, mask_targets, mask_types, tolerance
):
    if isinstance(mask_types, dict):
        default = None
    else:
        default = mask_types
        mask_types = {}

    mask = segmentation.mask

    polylines = []
    for target in np.unique(mask):
        if target == 0:
            continue  # skip background

        if mask_targets is not None:
            label = mask_targets.get(target, None)
            if label is None:
                continue  # skip unknown target
        else:
            label = str(target)

        label_type = mask_types.get(target, None)
        if label_type is None:
            if default is None:
                continue  # skip unknown type

            label_type = default

        label_mask = mask == target

        polygons = _get_polygons(label_mask, tolerance)

        if label_type == "stuff":
            polygons = [polygons]
        elif label_type == "thing":
            polygons = [[p] for p in polygons]
        else:
            raise ValueError(
                "Unsupported mask type '%s'. Supported values are "
                "('stuff', 'thing')"
            )

        for points in polygons:
            polyline = Polyline(
                label=label, points=points, filled=True, closed=True
            )
            polylines.append(polyline)

    return polylines


def _parse_stuff_instance(mask):
    cols = np.any(mask, axis=0)
    rows = np.any(mask, axis=1)
    xmin, xmax = np.where(cols)[0][[0, -1]]
    ymin, ymax = np.where(rows)[0][[0, -1]]

    height, width = mask.shape
    x = xmin / width
    y = ymin / height
    w = (xmax - xmin + 1) / width
    h = (ymax - ymin + 1) / height

    bbox = [x, y, w, h]
    instance_mask = mask[ymin:ymax, xmin:xmax]

    return bbox, instance_mask


def _parse_thing_instances(mask):
    height, width = mask.shape
    polygons = _get_polygons(mask, 2, abs_coords=True)

    instances = []
    for p in polygons:
        p = np.array(p)
        xmin, ymin = np.floor(p.min(axis=0)).astype(int)
        xmax, ymax = np.ceil(p.max(axis=0)).astype(int)

        xmax = max(xmin + 1, xmax)
        ymax = max(ymin + 1, ymax)

        x = xmin / width
        y = ymin / height
        w = (xmax - xmin) / width
        h = (ymax - ymin) / height

        bbox = [x, y, w, h]
        instance_mask = mask[ymin:ymax, xmin:xmax]

        instances.append((bbox, instance_mask))

    return instances


def _get_polygons(mask, tolerance, abs_coords=False):
    polygons = etai._mask_to_polygons(mask, tolerance=tolerance)
    if abs_coords:
        return polygons

    height, width = mask.shape
    return [[(x / width, y / height) for x, y in p] for p in polygons]


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
