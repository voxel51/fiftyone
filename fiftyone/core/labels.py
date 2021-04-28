"""
Labels stored in dataset samples.

| Copyright 2017-2021, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""
from bson import ObjectId

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
    """Mixin for :class:`Label` classes that expose a UUID via an ``id``
    property, as well as a ``tags`` attribute.
    """

    meta = {"allow_inheritance": True}

    _id = fof.ObjectIdField(
        required=True, default=ObjectId, unique=True, primary_key=True
    )
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
                approximate polyline for the instance mask
            filled (True): whether the polyline should be filled

        Returns:
            a :class:`Polyline`
        """
        dobj = self.to_detected_object()
        polyline = etai.convert_object_to_polygon(
            dobj, tolerance=tolerance, filled=filled
        )
        return Polyline.from_eta_polyline(polyline)

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
            attributes=attributes,
            tags=dobj.tags,
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

        return Detection(
            label=self.label,
            bounding_box=bounding_box,
            confidence=self.confidence,
            mask=mask,
            index=self.index,
            attributes=self.attributes,
            tags=self.tags,
        )

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
            attributes=attributes,
            tags=polyline.tags,
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
            attributes=attributes,
            tags=keypoints.tags,
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
