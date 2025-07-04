"""
Labels stored in dataset samples.

| Copyright 2017-2025, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""

import itertools
import warnings
from functools import partial

from bson import ObjectId
import cv2
import numpy as np
import scipy.ndimage as spn
import skimage.measure as skm
import skimage.segmentation as sks

import eta.core.frameutils as etaf
import eta.core.image as etai
import eta.core.utils as etau

import fiftyone.core.fields as fof
import fiftyone.core.metadata as fom
import fiftyone.core.utils as fou
from fiftyone.core.odm import DynamicEmbeddedDocument, EmbeddedDocument

foue = fou.lazy_import("fiftyone.utils.eta")
foug = fou.lazy_import("fiftyone.utils.geojson")
foui = fou.lazy_import("fiftyone.utils.image")
sg = fou.lazy_import(
    "shapely.geometry", callback=lambda: fou.ensure_package("shapely")
)


class _NoDefault(object):
    pass


no_default = _NoDefault()


class _HasMedia(object):
    """Mixin for :class:`Label` classes that contain a media field."""

    _MEDIA_FIELD = None


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
    that contains a dict of :class:`Attribute` instances.
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
        required=True,
        unique=True,
        default=lambda: str(ObjectId()),
        db_field="_id",
    )
    tags = fof.ListField(fof.StringField())

    @property
    def _id(self):
        return ObjectId(self.id)

    @_id.setter
    def _id(self, value):
        self.id = str(value)


class Instance(EmbeddedDocument):
    """A label instance.

    Args:
        id (None): the label instance ID
    """

    id = fof.ObjectIdField(default=lambda: str(ObjectId()), db_field="_id")

    @property
    def _id(self):
        return ObjectId(self.id)

    @_id.setter
    def _id(self, value):
        if not isinstance(value, ObjectId) and etau.is_str(value):
            value = ObjectId(value)

        self.id = value


class _HasInstance(Label):
    """Mixin for :class:`Label` classes that contain an instance configuration
    via an ``instance`` attribute.

    Contrary to the ``id`` field, which is unique to each label, the
    ``instance`` field is unique to each label instance either temporally or
    across different modalities, allowing you to identify the same logical
    label across different samples.
    """

    @property
    def instance_id(self):
        """The label's instance ID, or None if it does not have one."""
        try:
            return self.instance.id
        except AttributeError:
            return None


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
        logits (None): logits associated with the labels
    """

    _LABEL_LIST_FIELD = "classifications"

    classifications = fof.ListField(fof.EmbeddedDocumentField(Classification))
    logits = fof.VectorField()


class Detection(_HasAttributesDict, _HasID, _HasMedia, _HasInstance, Label):
    """An object detection.

    Args:
        label (None): the label string
        bounding_box (None): a list of relative bounding box coordinates in
            ``[0, 1]`` in the following format::

            [<top-left-x>, <top-left-y>, <width>, <height>]

        mask (None): an instance segmentation mask for the detection within
            its bounding box, which should be a 2D binary or 0/1 integer numpy
            array
        mask_path (None):  the absolute path to the instance segmentation image
            on disk, which should be a single-channel PNG image where any
            non-zero values represent the instance's extent
        confidence (None): a confidence in ``[0, 1]`` for the detection
        index (None): an index for the object
        instance (None): an instance of :class:`Instance` to link this
            detection label to other similar labels
        attributes ({}): a dict mapping attribute names to :class:`Attribute`
            instances
    """

    _MEDIA_FIELD = "mask_path"

    label = fof.StringField()
    bounding_box = fof.ListField(fof.FloatField())
    mask = fof.ArrayField()
    mask_path = fof.StringField()
    confidence = fof.FloatField()
    index = fof.IntField()

    @property
    def has_mask(self):
        """Whether this instance has a mask."""
        return self.mask is not None or self.mask_path is not None

    def get_mask(self):
        """Returns the detection mask for this instance.

        Returns:
            a numpy array, or ``None``
        """
        if self.mask is not None:
            return self.mask

        if self.mask_path is not None:
            return _read_mask(self.mask_path)

        return None

    def import_mask(self, update=False):
        """Imports this instance's mask from disk to its :attr:`mask`
        attribute.

        Args:
            update (False): whether to clear this instance's :attr:`mask_path`
                attribute after importing
        """
        if self.mask_path is not None:
            self.mask = _read_mask(self.mask_path)

            if update:
                self.mask_path = None

    def export_mask(self, outpath, update=False):
        """Exports this instance's mask to the given path.

        Args:
            outpath: the path to write the mask
            update (False): whether to clear this instance's :attr:`mask`
                attribute and set its :attr:`mask_path` attribute when
                exporting in-database segmentations
        """
        if self.mask_path is not None:
            etau.copy_file(self.mask_path, outpath)
        else:
            _write_mask(self.mask, outpath)

            if update:
                self.mask = None
                self.mask_path = outpath

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
            mask (None): an optional numpy array to use as an initial mask to
                which to add this object
            frame_size (None): the ``(width, height)`` of the segmentation
                mask to render. This parameter has no effect if a ``mask`` is
                provided
            target (255): the pixel value or RGB hex string to use to render
                the object

        Returns:
            a :class:`Segmentation`
        """
        if not self.has_mask:
            raise ValueError(
                "Only detections with their `mask` or `mask_path` attribute "
                "populated can be converted to segmentations"
            )

        mask, target = _parse_segmentation_target(mask, frame_size, target)
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
    def from_mask(cls, mask, label=None, **attributes):
        """Creates a :class:`Detection` instance with its ``mask`` attribute
        populated from the given full image mask.

        The instance mask for the object is extracted by computing the bounding
        rectangle of the non-zero values in the image mask.

        Args:
            mask: a boolean or 0/1 numpy array
            label (None): the label string
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
            mask (None): an optional array to use as an initial mask to which
                to add objects
            frame_size (None): the ``(width, height)`` of the segmentation
                mask to render. This parameter has no effect if a ``mask`` is
                provided
            mask_targets (None): a dict mapping integer pixel values (2D masks)
                or RGB hex strings (3D masks) to label strings defining which
                object classes to render and which pixel values to use for each
                class. If omitted, all objects are rendered with pixel value
                255

        Returns:
            a :class:`Segmentation`
        """
        mask, labels_to_targets = _parse_segmentation_mask_targets(
            mask, frame_size, mask_targets
        )

        # pylint: disable=not-an-iterable
        for detection in self.detections:
            if not detection.has_mask:
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


class Polyline(_HasAttributesDict, _HasID, _HasInstance, Label):
    """A set of semantically related polylines or polygons.

    Args:
        label (None): a label for the polyline
        points (None): a list of lists of ``(x, y)`` points in
            ``[0, 1] x [0, 1]`` describing the vertices of each shape in the
            polyline
        confidence (None): a confidence in ``[0, 1]`` for the polyline
        index (None): an index for the polyline
        instance (None): an instance of :class:`Instance` to link this
            polyline label to other similar labels
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
            mask (None): an optional numpy array to use as an initial mask to
                which to add objects
            frame_size (None): the ``(width, height)`` of the segmentation
                mask to render. This parameter has no effect if a ``mask`` is
                provided
            target (255): the pixel value or RGB hex string to use to render
                the object
            thickness (1): the thickness, in pixels, at which to render
                (non-filled) polylines

        Returns:
            a :class:`Segmentation`
        """
        mask, target = _parse_segmentation_target(mask, frame_size, target)
        _render_polyline(mask, self, target, thickness)
        return Segmentation(mask=mask)

    def to_shapely(self, frame_size=None, filled=None):
        """Returns a Shapely representation of this instance.

        The type of geometry returned depends on the number of shapes
        (:attr:`points`) and whether they are polygons or lines
        (:attr:`filled`).

        Args:
            frame_size (None): the ``(width, height)`` of the image. If
                provided, the returned geometry will use absolute coordinates
            filled (None): whether to treat the shape as filled (True) or
                hollow (False) regardless of its :attr:`filled` attribute

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
        if filled is not None:
            _filled = filled
        else:
            _filled = self.filled

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
            if _filled:
                return sg.Polygon(points[0])

            return sg.LineString(points[0])

        if _filled:
            return sg.MultiPolygon(list(zip(points, itertools.repeat(None))))

        return sg.MultiLineString(points)

    @classmethod
    def from_mask(cls, mask, label=None, tolerance=2, **attributes):
        """Creates a :class:`Polyline` instance with polygons describing the
        non-zero region(s) of the given full image mask.

        Args:
            mask: a boolean or 0/1 numpy array
            label (None): the label string
            tolerance (2): a tolerance, in pixels, when generating approximate
                polygons for each region. Typical values are 1-3 pixels
            **attributes: additional attributes for the :class:`Polyline`

        Returns:
            a :class:`Polyline`
        """
        if mask.ndim > 2:
            mask = mask[:, :, 0]

        points = _get_polygons(
            mask.astype(bool),
            tolerance=tolerance,
        )

        return cls(
            label=label, points=points, filled=True, closed=True, **attributes
        )

    @classmethod
    def from_cuboid(cls, vertices, frame_size=None, label=None, **attributes):
        """Constructs a cuboid from its 8 vertices in the format below::

               7--------6
              /|       /|
             / |      / |
            3--------2  |
            |  4-----|--5
            | /      | /
            |/       |/
            0--------1

        If a ``frame_size`` is provided, ``vertices`` must be absolute pixel
        coordinates; otherwise ``vertices`` should be normalized coordinates in
        ``[0, 1] x [0, 1]``.

        Args:
            vertices: a list of 8 ``(x, y)`` vertices in the above format
            frame_size (None): the ``(width, height)`` of the frame
            label (None): the label string
            **attributes: additional arguments for the :class:`Polyline`

        Returns:
            a :class:`Polyline`
        """
        vertices = np.asarray(vertices)
        if frame_size is not None:
            vertices /= np.asarray(frame_size)[np.newaxis, :]

        front = vertices[:4]
        back = vertices[4:]
        top = vertices[[3, 2, 6, 7], :]
        bottom = vertices[[0, 1, 5, 4], :]
        faces = [front.tolist(), back.tolist(), top.tolist(), bottom.tolist()]
        return cls(label=label, points=faces, closed=True, **attributes)

    @classmethod
    def from_rotated_box(
        cls, xc, yc, w, h, theta, frame_size=None, label=None, **attributes
    ):
        """Constructs a rotated bounding box from its center, dimensions, and
        rotation.

        If a ``frame_size`` is provided, the provided box coordinates must be
        absolute pixel coordinates; otherwise they should be normalized
        coordinates in ``[0, 1]``. Note that rotations in normalized
        coordinates only make sense when the source aspect ratio is square.

        Args:
            xc: the x-center coordinate
            yc: the y-center coorindate
            w: the box width
            y: the box height
            theta: the counter-clockwise rotation of the box in radians
            frame_size (None): the ``(width, height)`` of the frame
            label (None): the label string
            **attributes: additional arguments for the :class:`Polyline`

        Returns:
            a :class:`Polyline`
        """
        R = _rotation_matrix(theta)
        x = 0.5 * w * np.array([1, -1, -1, 1])
        y = 0.5 * h * np.array([1, 1, -1, -1])
        points = R.dot(np.stack((x, y))).T + np.array((xc, yc))
        if frame_size is not None:
            points /= np.asarray(frame_size)[np.newaxis, :]

        points = points.tolist()
        return cls(label=label, points=[points], closed=True, **attributes)


def _rotation_matrix(theta):
    return np.array(
        [[np.cos(theta), -np.sin(theta)], [np.sin(theta), np.cos(theta)]]
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
            mask (None): an optional numpy array to use as an initial mask to
                which to add objects
            frame_size (None): the ``(width, height)`` of the segmentation
                mask to render. This parameter has no effect if a ``mask`` is
                provided
            mask_targets (None): a dict mapping integer pixel values (2D masks)
                or RGB hex strings (3D masks) to label strings defining which
                object classes to render and which pixel values to use for each
                class. If omitted, all objects are rendered with pixel value
                255
            thickness (1): the thickness, in pixels, at which to render
                (non-filled) polylines

        Returns:
            a :class:`Segmentation`
        """
        mask, labels_to_targets = _parse_segmentation_mask_targets(
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


class Keypoint(_HasAttributesDict, _HasID, _HasInstance, Label):
    """A list of keypoints in an image.

    Args:
        label (None): a label for the points
        points (None): a list of ``(x, y)`` keypoints in ``[0, 1] x [0, 1]``
        confidence (None): a list of confidences in ``[0, 1]`` for each point
        index (None): an index for the keypoints
        instance (None): an instance of :class:`Instance` to link this
            keypoint label to other similar labels
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

    def apply_confidence_threshold(self, confidence_thresh):
        """Replaces all ``points`` on this instance whose confidence are below
        the provided threshold with ``np.nan``.

        Use
        :meth:`filter_keypoints <fiftyone.core.collections.SampleCollection.filter_keypoints`
        to perform this operation as temporary view rather than a permanent
        data transformation.

        Args:
            confidence_thresh: a confidence threshold
        """
        if self.confidence is None:
            return

        _points = np.array(self.points)
        _confs = np.array(self.confidence)
        _points[_confs < confidence_thresh] = np.nan

        self.points = _points.tolist()


class Keypoints(_HasLabelList, Label):
    """A list of :class:`Keypoint` instances in an image.

    Args:
        keypoints (None): a list of :class:`Keypoint` instances
    """

    _LABEL_LIST_FIELD = "keypoints"

    keypoints = fof.ListField(fof.EmbeddedDocumentField(Keypoint))


class Segmentation(_HasID, _HasMedia, Label):
    """A semantic segmentation for an image.

    Provide either the ``mask`` or ``mask_path`` argument to define the
    segmentation.

    Args:
        mask (None): a numpy array with integer values encoding the semantic
            labels
        mask_path (None): the absolute path to the segmentation image on disk
    """

    _MEDIA_FIELD = "mask_path"

    mask = fof.ArrayField()
    mask_path = fof.StringField()

    @property
    def has_mask(self):
        """Whether this instance has a mask."""
        return self.mask is not None or self.mask_path is not None

    def get_mask(self):
        """Returns the segmentation mask for this instance.

        Returns:
            a numpy array, or ``None``
        """
        if self.mask is not None:
            return self.mask

        if self.mask_path is not None:
            return _read_mask(self.mask_path)

        return None

    def import_mask(self, update=False):
        """Imports this instance's mask from disk to its :attr:`mask`
        attribute.

        Args:
            update (False): whether to clear this instance's :attr:`mask_path`
                attribute after importing
        """
        if self.mask_path is not None:
            self.mask = _read_mask(self.mask_path)

            if update:
                self.mask_path = None

    def export_mask(self, outpath, update=False):
        """Exports this instance's mask to the given path.

        Args:
            outpath: the path to write the mask
            update (False): whether to clear this instance's :attr:`mask`
                attribute and set its :attr:`mask_path` attribute when
                exporting in-database segmentations
        """
        if self.mask_path is not None:
            etau.copy_file(self.mask_path, outpath)
        else:
            _write_mask(self.mask, outpath)

            if update:
                self.mask = None
                self.mask_path = outpath

    def transform_mask(self, targets_map, outpath=None, update=False):
        """Transforms this instance's mask according to the provided targets
        map.

        This method can be used to transform between grayscale and RGB masks,
        or it can be used to edit the pixel values or colors of a mask without
        changing the number of channels.

        Note that any pixel values not in ``targets_map`` will be zero in the
        transformed mask.

        Args:
            targets_map: a dict mapping existing pixel values (2D masks) or RGB
                hex strings (3D masks) to new pixel values or RGB hex strings.
                You may convert between grayscale and RGB using this argument
            outpath (None): an optional path to write the transformed mask on
                disk
            update (False): whether to save the transformed mask on this
                instance

        Returns:
            the transformed mask
        """
        mask = self.get_mask()
        if mask is None:
            return

        mask = _transform_mask(mask, targets_map)

        if outpath is not None:
            _write_mask(mask, outpath)

            if update:
                self.mask = None
                self.mask_path = outpath
        elif update:
            if self.mask_path is not None:
                _write_mask(mask, self.mask_path)
            else:
                self.mask = mask

        return mask

    def to_detections(self, mask_targets=None, mask_types="stuff"):
        """Returns a :class:`Detections` representation of this instance with
        instance masks populated.

        Each ``"stuff"`` class will be converted to a single :class:`Detection`
        whose instance mask spans all region(s) of the class.

        Each ``"thing"`` class will result in one :class:`Detection` instance
        per connected region of that class in the segmentation.

        Args:
            mask_targets (None): a dict mapping integer pixel values (2D masks)
                or RGB hex strings (3D masks) to label strings defining which
                classes to generate detections for. If omitted, all labels are
                assigned to their pixel values
            mask_types ("stuff"): whether the classes are ``"stuff"``
                (amorphous regions of pixels) or ``"thing"`` (connected
                regions, each representing an instance of the thing). Can be
                any of the following:

                -   ``"stuff"`` if all classes are stuff classes
                -   ``"thing"`` if all classes are thing classes
                -   a dict mapping pixel values (2D masks) or RGB hex strings
                    (3D masks) to ``"stuff"`` or ``"thing"`` for each class

        Returns:
            a :class:`Detections`
        """
        detections = _segmentation_to_detections(
            self, mask_targets, mask_types
        )
        return Detections(detections=detections)

    def to_polylines(
        self,
        mask_targets=None,
        mask_types="stuff",
        tolerance=2,
    ):
        """Returns a :class:`Polylines` representation of this instance.

        Each ``"stuff"`` class will be converted to a single :class:`Polyline`
        that may contain multiple disjoint shapes capturing the class.

        Each ``"thing"`` class will result in one :class:`Polyline` instance
        per connected region of that class.

        Args:
            mask_targets (None): a dict mapping integer pixel values (2D masks)
                or RGB hex strings (3D masks) to label strings defining which
                classes to generate detections for. If omitted, all labels are
                assigned to their pixel values
            mask_types ("stuff"): whether the classes are ``"stuff"``
                (amorphous regions of pixels) or ``"thing"`` (connected
                regions, each representing an instance of the thing). Can be
                any of the following:

                -   ``"stuff"`` if all classes are stuff classes
                -   ``"thing"`` if all classes are thing classes
                -   a dict mapping pixel values (2D masks) or RGB hex strings
                    (3D masks) to ``"stuff"`` or ``"thing"`` for each class
            tolerance (2): a tolerance, in pixels, when generating approximate
                polylines for each region. Typical values are 1-3 pixels

        Returns:
            a :class:`Polylines`
        """
        polylines = _segmentation_to_polylines(
            self, mask_targets, mask_types, tolerance
        )
        return Polylines(polylines=polylines)


class Heatmap(_HasID, _HasMedia, Label):
    """A heatmap for an image.

    Provide either the ``map`` or ``map_path`` argument to define the heatmap.

    Args:
        map (None): a 2D numpy array
        map_path (None): the absolute path to the heatmap image on disk
        range (None): an optional ``[min, max]`` range of the map's values. If
            None is provided, ``[0, 1]`` will be assumed if ``map`` contains
            floating point values, ``[0, 255]`` will be assumed if ``map``
            contains integer values, and the dtype of the image will be assumed
            if ``map_path`` is used
    """

    _MEDIA_FIELD = "map_path"

    map = fof.ArrayField()
    map_path = fof.StringField()
    range = fof.HeatmapRangeField()

    @property
    def has_map(self):
        """Whether this instance has a map."""
        return self.map is not None or self.map_path is not None

    def get_map(self):
        """Returns the map array for this instance.

        Returns:
            a numpy array, or ``None``
        """
        if self.map is not None:
            return self.map

        if self.map_path is not None:
            return _read_heatmap(self.map_path)

        return None

    def import_map(self, update=False):
        """Imports this instance's map from disk to its :attr:`map` attribute.

        Args:
            outpath: the path to write the map
            update (False): whether to clear this instance's :attr:`map_path`
                attribute after importing
        """
        if self.map_path is not None:
            self.map = _read_heatmap(self.map_path)

            if update:
                self.map_path = None

    def export_map(self, outpath, update=False):
        """Exports this instance's map to the given path.

        Args:
            outpath: the path to write the map
            update (False): whether to clear this instance's :attr:`map` and
                :attr:`range` attributes and set its :attr:`map_path` attribute
                when exporting in-database heatmaps
        """
        if self.map_path is not None:
            etau.copy_file(self.map_path, outpath)
        else:
            _write_heatmap(self.map, outpath, range=self.range)

            if update:
                self.map = None
                self.map_path = outpath
                self.range = None


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

_INDEX_FIEDS = (
    Detection,
    Detections,
    Polyline,
    Polylines,
    Keypoint,
    Keypoints,
)

_INSTANCE_FIELDS = (Detection, Polyline, Keypoint)

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


def _read_mask(mask_path):
    # pylint: disable=no-member
    return foui.read(mask_path, flag=cv2.IMREAD_UNCHANGED)


def _write_mask(mask, mask_path):
    mask = _mask_to_image(mask)
    foui.write(mask, mask_path)


def _transform_mask(in_mask, targets_map):
    rgb_in = fof.is_rgb_mask_targets(targets_map)
    rgb_out = fof.is_rgb_mask_targets({v: k for k, v in targets_map.items()})

    if rgb_in:
        if in_mask.ndim != 3:
            raise ValueError(
                "Cannot use RGB input targets to transform grayscale mask"
            )

        in_mask = _rgb_array_to_int(in_mask)
        targets_map = {_hex_to_int(k): v for k, v in targets_map.items()}
    else:
        if in_mask.ndim == 3:
            raise ValueError(
                "Cannot use integer input targets to transform RGB mask"
            )

    if rgb_out:
        targets_map = {k: _hex_to_int(v) for k, v in targets_map.items()}

    if rgb_out:
        dtype = int
    elif max(targets_map.values(), default=0) > 255:
        dtype = np.uint16
    else:
        dtype = np.uint8

    out_mask = np.zeros_like(in_mask, dtype=dtype)
    objects = _find_slices(in_mask)
    for in_val, out_val in targets_map.items():
        slices = objects.get(in_val, None)
        if slices is not None:
            out_mask[slices][in_mask[slices] == in_val] = out_val

    if rgb_out:
        out_mask = _int_array_to_rgb(out_mask)

    return out_mask


def _mask_to_image(mask):
    if mask.dtype in (np.uint8, np.uint16):
        return mask

    # Masks should contain integer values, so cast to the closest suitable
    # unsigned type
    if mask.max() <= 255:
        return mask.astype(np.uint8)

    return mask.astype(np.uint16)


def _read_heatmap(map_path):
    # pylint: disable=no-member
    return foui.read(map_path, flag=cv2.IMREAD_UNCHANGED)


def _write_heatmap(map, map_path, range):
    map = _heatmap_to_image(map, range)
    foui.write(map, map_path)


def _heatmap_to_image(map, range):
    if range is None:
        if map.dtype in (np.uint8, np.uint16):
            return map

        range = (map.min(), map.max())
    else:
        range = tuple(range)

    if map.dtype == np.uint8 and range == (0, 255):
        return map

    if map.dtype == np.uint16 and range == (0, 65535):
        return map

    map = (255.0 / (range[1] - range[0])) * ((map - range[0]))
    return map.astype(np.uint8)


def _parse_segmentation_target(mask, frame_size, target):
    if target is not None:
        is_rgb = fof.is_rgb_target(target)
    else:
        is_rgb = False

    if mask is None:
        if frame_size is None:
            raise ValueError("Either `mask` or `frame_size` must be provided")

        if target is not None and not is_rgb and target > 255:
            dtype = int
        else:
            dtype = np.uint8

        width, height = frame_size
        if is_rgb:
            mask = np.zeros((height, width, 3), dtype=dtype)
        else:
            mask = np.zeros((height, width), dtype=dtype)

    if target is not None and is_rgb:
        target = _hex_to_rgb(target)

    return mask, target


def _parse_segmentation_mask_targets(mask, frame_size, mask_targets):
    if mask_targets is not None:
        is_rgb = fof.is_rgb_mask_targets(mask_targets)
    else:
        is_rgb = False

    if mask is None:
        if frame_size is None:
            raise ValueError("Either `mask` or `frame_size` must be provided")

        if mask_targets is not None and not is_rgb and max(mask_targets) > 255:
            dtype = int
        else:
            dtype = np.uint8

        width, height = frame_size
        if is_rgb:
            mask = np.zeros((height, width, 3), dtype=dtype)
        else:
            mask = np.zeros((height, width), dtype=dtype)

    if mask_targets is not None:
        if is_rgb:
            labels_to_targets = {
                v: _hex_to_rgb(k) for k, v in mask_targets.items()
            }
        else:
            labels_to_targets = {v: k for k, v in mask_targets.items()}
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
    target = np.asarray(target)

    if mask.ndim == 3:
        patch = mask[y0 : (y0 + dh), x0 : (x0 + dw), :]
        if target.size == 3:
            patch[obj_mask, :] = np.reshape(target, (1, 1, 3))
        else:
            patch[obj_mask, :] = target
        mask[y0 : (y0 + dh), x0 : (x0 + dw), :] = patch
    else:
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


def _find_slices(mask):
    """Return slices that tightly bound each unique object in `mask`."""
    relabeled, forward, backward = sks.relabel_sequential(mask)
    slices = spn.find_objects(relabeled)
    return dict((backward[idx + 1], slc) for idx, slc in enumerate(slices))


def _convert_segmentation(segmentation, mask_targets, mask_types, converter):
    """Convert segmentation to a collection of detections, polylines, etc.

    `converter(label_mask, label, label_type, offset, frame_size)` is
    a function that returns a list of detections, polylines, etc. It
    gets called for each value in `mask_targets`, or for all values in
    the mask if `mask_targets` is `None`.
    """
    if isinstance(mask_types, dict):
        default = None
    else:
        default = mask_types
        mask_types = {}

    mask = segmentation.get_mask()
    is_rgb = mask.ndim == 3

    if is_rgb:
        # convert to int, like in transform_mask
        mask = _rgb_array_to_int(mask)
        if mask_targets is not None:
            mask_targets = {_hex_to_int(k): v for k, v in mask_targets.items()}

    mask = mask.squeeze()
    if mask.ndim != 2:
        raise ValueError(f"Unsupported mask dimensions: {mask.ndim}")

    objects = _find_slices(mask)
    results = []
    for target, slices in objects.items():
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

        label_mask = mask[slices] == target
        offset = list(s.start for s in slices)[::-1]
        frame_size = mask.shape[:2][::-1]

        new_results = converter(
            label_mask, label, label_type, offset, frame_size
        )
        results.extend(new_results)

    return results


def _mask_to_detections(label_mask, label, label_type, offset, frame_size):
    if label_type == "stuff":
        instances = [_parse_stuff_instance(label_mask, offset, frame_size)]
    elif label_type == "thing":
        instances = _parse_thing_instances(label_mask, offset, frame_size)
    else:
        raise ValueError(
            "Unsupported mask type '%s'. Supported values are "
            "('stuff', 'thing')"
        )

    return list(
        Detection(label=label, bounding_box=bbox, mask=instance_mask)
        for bbox, instance_mask in instances
    )


def _mask_to_polylines(
    label_mask, label, label_type, offset, frame_size, tolerance
):
    polygons = _get_polygons(
        label_mask,
        tolerance=tolerance,
        offset=offset,
        frame_size=frame_size,
    )

    if label_type == "stuff":
        polygons = [polygons]
    elif label_type == "thing":
        polygons = [[p] for p in polygons]
    else:
        raise ValueError(
            "Unsupported mask type '%s'. Supported values are "
            "('stuff', 'thing')"
        )

    return list(
        Polyline(label=label, points=points, filled=True, closed=True)
        for points in polygons
    )


def _segmentation_to_detections(segmentation, mask_targets, mask_types):
    return _convert_segmentation(
        segmentation, mask_targets, mask_types, _mask_to_detections
    )


def _segmentation_to_polylines(
    segmentation, mask_targets, mask_types, tolerance
):
    converter = partial(_mask_to_polylines, tolerance=tolerance)
    return _convert_segmentation(
        segmentation, mask_targets, mask_types, converter
    )


def _hex_to_rgb(hex_str):
    r = int(hex_str[1:3], 16)
    g = int(hex_str[3:5], 16)
    b = int(hex_str[5:7], 16)
    return (r, g, b)


def _rgb_to_hex(rgb):
    return "#%02x%02x%02x" % tuple(rgb)


def _hex_to_int(hex_str):
    r = int(hex_str[1:3], 16)
    g = int(hex_str[3:5], 16)
    b = int(hex_str[5:7], 16)
    return (r << 16) + (g << 8) + b


def _int_to_hex(value):
    r = (value >> 16) & 255
    g = (value >> 8) & 255
    b = value & 255
    return "#%02x%02x%02x" % (r, g, b)


def _rgb_array_to_int(mask):
    return (
        np.left_shift(mask[:, :, 0], 16, dtype=int)
        + np.left_shift(mask[:, :, 1], 8, dtype=int)
        + mask[:, :, 2]
    )


def _int_array_to_rgb(mask):
    out_mask = np.empty((*mask.shape, 3), dtype=np.uint8)
    out_mask[:, :, 0] = np.right_shift(mask, 16) & 255
    out_mask[:, :, 1] = np.right_shift(mask, 8) & 255
    out_mask[:, :, 2] = mask & 255
    return out_mask


def _parse_stuff_instance(mask, offset=None, frame_size=None):
    cols = np.any(mask, axis=0)
    rows = np.any(mask, axis=1)
    xmin, xmax = np.where(cols)[0][[0, -1]]
    ymin, ymax = np.where(rows)[0][[0, -1]]

    if offset is None:
        x_offset, y_offset = (0, 0)
    else:
        x_offset, y_offset = offset

    if frame_size is None:
        height, width = mask.shape
    else:
        width, height = frame_size

    x = (xmin + x_offset) / width
    y = (ymin + y_offset) / height
    w = (xmax - xmin + 1) / width
    h = (ymax - ymin + 1) / height

    bbox = [x, y, w, h]
    instance_mask = mask[ymin : (ymax + 1), xmin : (xmax + 1)]

    return bbox, instance_mask


def _parse_thing_instances(mask, offset=None, frame_size=None):
    if offset is None:
        x_offset, y_offset = (0, 0)
    else:
        x_offset, y_offset = offset

    if frame_size is None:
        height, width = mask.shape
    else:
        width, height = frame_size

    labeled = skm.label(mask)
    objects = _find_slices(labeled)
    instances = []
    for target, slc in objects.items():
        yslice, xslice = slc
        xmin = xslice.start
        ymin = yslice.start
        instance_offset = (
            offset[0] + xmin,
            offset[1] + ymin,
        )

        # use the labeled image mask so `_parse_stuff_instance()`
        # can be re-used here
        instance_mask = labeled[slc] == target
        instance = _parse_stuff_instance(
            instance_mask, instance_offset, frame_size
        )
        instances.append(instance)

    return instances


def _get_polygons(
    mask,
    tolerance,
    offset=None,
    frame_size=None,
    abs_coords=False,
):
    if offset is None:
        x_offset, y_offset = (0, 0)
    else:
        x_offset, y_offset = offset

    if abs_coords:
        height, width = (1, 1)
    else:
        if frame_size is None:
            height, width = mask.shape
        else:
            width, height = frame_size

    polygons = etai._mask_to_polygons(mask, tolerance=tolerance)
    polygons = list(
        list(
            (
                (x + x_offset) / width,
                (y + y_offset) / height,
            )
            for x, y in p
        )
        for p in polygons
    )
    return polygons


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
