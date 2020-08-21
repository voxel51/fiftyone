"""
Data structures for working with geometric objects like points and bounding
boxes.

| Copyright 2017-2020, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""
import eta.core.numutils as etan

from fiftyone.core.odm.document import DynamicEmbeddedDocument
import fiftyone.core.fields as fof


class BoundingBox(DynamicEmbeddedDocument):
    """A bounding box around an object in an image.

    The bounding box coordinates are stored as relative values in
    ``[0, 1] x [0, 1]``.

    Args:
        x: the x-coordinate of the top-left corner of the box, in ``[0, 1]``
        y: the y-coordinate of the top-left corner of the box, in ``[0, 1]``
        width: the width of the box, in ``[0, 1]``
        height: the height of the box, in ``[0, 1]``
    """

    meta = {"allow_inheritance": True}

    x = fof.FloatField()
    y = fof.FloatField()
    width = fof.FloatField()
    height = fof.FloatField()

    def __str__(self):
        return "[%.3f, %.3f] x [%.3f, %.3f]" % (
            self.top_left + self.bottom_right
        )

    def __eq__(self, other):
        return (
            etan.is_close(self.x, other.x)
            and etan.is_close(self.y, other.y)
            and etan.is_close(self.width, other.width)
            and etan.is_close(self.height, other.height)
        )

    @property
    def top_left(self):
        """The ``(x, y)`` coordinates of the top-left corner of the box."""
        return (self.x, self.y)

    @property
    def top_right(self):
        """The ``(x, y)`` coordinates of the top-right corner of the box."""
        return (self.x + self.width, self.y)

    @property
    def bottom_left(self):
        """The ``(x, y)`` coordinates of the bottom-left corner of the box."""
        return (self.x, self.y + self.height)

    @property
    def bottom_right(self):
        """The ``(x, y)`` coordinates of the bottom-right corner of the box."""
        return (self.x + self.width, self.y + self.height)

    @property
    def is_proper(self):
        """Whether the bounding box is proper, i.e., its top-left coordinate
        lies to the left and above its bottom-right coordinate.
        """
        return self.height >= 0 and self.width >= 0

    def ensure_proper(self):
        """Ensures that the bounding box if proper by swapping its coordinates
        as necessary.
        """
        if self.height < 0:
            height = -self.height
            self.y -= height
            self.height = height

        if self.width < 0:
            width = -self.width
            self.x -= width
            self.width = width

    def coords_in(self, frame_size=None, shape=None, img=None):
        """Returns the coordinates of the bounding box in the specified image.

        Pass *one* keyword argument to this function.

        Args:
            frame_size (None): the ``(width, height)`` of the image
            shape (None): the ``(height, width, ...)`` of the image, e.g. from
                ``img.shape``
            img (None): the image itself

        Returns:
            an ``(x, y, width, height)`` tuple describing the pixel coordinates
            of the bounding box
        """
        w, h = _to_frame_size(frame_size=frame_size, shape=shape, img=img)

        xtl, ytl = self.top_left
        xbr, ybr = self.bottom_right

        _xtl, _ytl = int(w * 1.0 * xtl), int(h * 1.0 * ytl)
        _xbr, _ybr = int(w * 1.0 * xbr), int(h * 1.0 * ybr)

        return _xtl, _ytl, _xbr - _xtl, _ybr - _ytl

    def aspect_ratio_in(self, frame_size=None, shape=None, img=None):
        """Returns the aspect ratio of the bounding box in the specified image.

        Pass *one* keyword argument to this function.

        Args:
            frame_size (None): the ``(width, height)`` of the image
            shape (None): the ``(height, width, ...)`` of the image, e.g. from
                ``img.shape``
            img (None): the image itself

        Returns:
            the aspect ratio of the box
        """
        w, h = _to_frame_size(frame_size=frame_size, shape=shape, img=img)
        return self.width * w / (h * self.height)

    def extract_from(self, img, force_square=False):
        """Extracts the patch defined by this bounding box from the image.

        Args:
            img: the image
            force_square (False): whether to (minimally) manipulate the
                bounding box during extraction so that the returned patch is
                square

        Returns:
            the extracted patch
        """
        x1, y1 = _coords_in(self.x, self.y, img=img)
        x2, y2 = _coords_in(*self.bottom_right, img=img)
        x = slice(x1, x2)
        y = slice(y1, y2)
        if force_square:
            h, w = img.shape[:2]
            x, y = _make_square(x, y, w, h)

        return img[y, x, ...]

    def pad_relative(self, alpha):
        """Returns a bounding box whose length and width are expanded (or
        shrunk, when alpha < 0) by ``(100 * alpha)%``.

        The coordinates are clamped to ``[0, 1] x [0, 1]`` if necessary.

        Args:
            alpha: the desired padding relative to the size of this bounding
                box; a float in ``[-1, \\inf)``

        Returns:
            the padded :class:`BoundingBox`
        """
        w = self.width
        h = self.height

        alpha = max(alpha, -1)
        wpad = 0.5 * alpha * w
        hpad = 0.5 * alpha * h

        tlx, tly = _clamp(self.x - wpad, self.y - hpad)
        brx, bry = _clamp(self.x + w + wpad, self.y + h + hpad)

        return BoundingBox.from_corners(tlx, tly, brx, bry)

    def area(self):
        """Computes the area of the bounding box, in ``[0, 1]``.

        Returns:
            the area
        """
        return self.width * self.height

    def centroid(self):
        """Computes the cenroid of the bounding box.

        Returns:
            an ``(x, y)`` tuple
        """
        return (self.x + 0.5 * self.width, self.y + 0.5 * self.height)

    def get_intersection(self, bbox):
        """Returns the bounding box describing the intersection of this
        bounding box with the given bounding box.

        If the bounding boxes do not intersect, an empty bounding box is
        returned.

        Args:
            bbox: a :class:`BoundingBox`

        Returns:
            a :class:`BoundingBox` describing the intersection
        """
        tlx = max(self.x, bbox.x)
        tly = max(self.y, bbox.y)
        brx = min(self.x + self.width, bbox.x + bbox.width)
        bry = min(self.y + self.height, bbox.y + bbox.height)

        if (brx - tlx < 0) or (bry - tly < 0):
            return BoundingBox.empty()

        return BoundingBox.from_coords(tlx, tly, brx, bry)

    def contains_box(self, bbox):
        """Determines if this bounding box contains the given bounding box.

        Args:
            bbox: a :class:`BoundingBox`

        Returns:
            True/False
        """
        return self.get_intersection(bbox) == bbox

    def compute_overlap(self, bbox):
        """Computes the proportion of this bounding box that overlaps the given
        bounding box.

        Args:
            bbox: a :class:`BoundingBox`

        Returns:
            the overlap in ``[0, 1]``
        """
        try:
            inter_area = self.get_intersection(bbox).area()
            return inter_area / self.area()
        except ZeroDivisionError:
            return 0.0

    def compute_iou(self, bbox):
        """Computes the IoU (intersection over union) of the bounding boxes.

        The IoU is defined as the area of the intersection of the boxes divided
        by the area of their union.

        Args:
            bbox: a :class:`BoundingBox`

        Returns:
            the IoU in ``[0, 1]``
        """
        inter_area = self.get_intersection(bbox).area()
        union_area = self.area() + bbox.area() - inter_area
        try:
            return inter_area / union_area
        except ZeroDivisionError:
            return 0.0

    @classmethod
    def empty(cls):
        """Returns an empty :class:`BoundingBox` at the origin.

        Returns:
            a :class:`BoundingBox`
        """
        return cls(x=0, y=0, width=0, height=0)

    def to_coords(self):
        """Returns an ``(x, y, width, height)`` tuple for the bounding box.

        Returns:
            a ``(x, y, width, height)`` tuple
        """
        return (self.x, self.y, self.width, self.height)

    @classmethod
    def from_coords(cls, x, y, width, height, clamp=True):
        """Constructs a :class:`BoundingBox` from its relative coordinates.

        Args:
            x: the top-left x coordinate in ``[0, 1]``
            y: the top-left y coordinate in ``[0, 1]``
            width: the width of the box in ``[0, 1]``
            height: the height of the box in ``[0, 1]``
            clamp (True): whether to clamp the box to ``[0, 1] x [0, 1]`` if
                necessary

        Returns:
            a :class:`BoundingBox`
        """
        if clamp:
            x, y = _clamp(x, y)
            brx, bry = _clamp(x + width, y + height)
            width, height = brx - x, bry - y

        return cls(x=x, y=y, width=width, height=height)

    @classmethod
    def from_abs_coords(
        cls,
        x,
        y,
        width,
        height,
        clamp=True,
        frame_size=None,
        shape=None,
        img=None,
    ):
        """Constructs a :class:`BoundingBox` from its absolute pixel
        coordinates.

        One of ``frame_size``, ``shape``, or ``img`` must be provided.

        Args:
            tlx: the top-left x coordinate, in pixels
            tly: the top-left y coordinate, in pixels
            width: the width of the box, in pixels
            height: the height of the box, in pixels
            clamp (True): whether to clamp the box to ``[0, 1] x [0, 1]`` if
                necessary
            frame_size (None): the ``(width, height)`` of the image
            shape (None): the ``(height, width, ...)`` of the image, e.g. from
                ``img.shape``
            img (None): the image itself

        Returns:
            a :class:`BoundingBox`
        """
        x, y = _to_rel_coords(
            x, y, frame_size=frame_size, shape=shape, img=img
        )
        brx, bry = _to_rel_coords(
            x + width, y + height, frame_size=frame_size, shape=shape, img=img
        )
        if clamp:
            x, y = _clamp(x, y)
            brx, bry = _clamp(brx, bry)

        width = brx - x
        height = bry - y
        return cls(x=x, y=y, width=width, height=height)

    @classmethod
    def from_corners(cls, tlx, tly, brx, bry, clamp=True):
        """Constructs a :class:`BoundingBox` from top-left and bottom-right
        relative coordinates.

        Args:
            tlx: the top-left x coordinate in ``[0, 1]``
            tly: the top-left y coordinate in ``[0, 1]``
            brx: the bottom-right x coordinate in ``[0, 1]``
            bry: the bottom-right y coordinate in ``[0, 1]``
            clamp (True): whether to clamp the box to ``[0, 1] x [0, 1]`` if
                necessary

        Returns:
            a :class:`BoundingBox`
        """
        if clamp:
            tlx, tly = _clamp(tlx, tly)
            brx, bry = _clamp(brx, bry)

        width = brx - tlx
        height = bry - tly
        return cls(x=tlx, y=tly, width=width, height=height)

    @classmethod
    def from_abs_corners(
        cls,
        tlx,
        tly,
        brx,
        bry,
        clamp=True,
        frame_size=None,
        shape=None,
        img=None,
    ):
        """Constructs a :class:`BoundingBox` from absolute top-left and
        bottom-right pixel coordinates.

        One of ``frame_size``, ``shape``, or ``img`` must be provided.

        Args:
            tlx: the top-left x coordinate, in pixels
            tly: the top-left y coordinate, in pixels
            brx: the bottom-right x coordinate, in pixels
            bry: the bottom-right y coordinate, in pixels
            clamp (True): whether to clamp the box to ``[0, 1] x [0, 1]`` if
                necessary
            frame_size (None): the ``(width, height)`` of the image
            shape (None): the ``(height, width, ...)`` of the image, e.g. from
                ``img.shape``
            img (None): the image itself

        Returns:
            a :class:`BoundingBox`
        """
        tlx, tly = _to_rel_coords(
            tlx, tly, frame_size=frame_size, shape=shape, img=img
        )
        brx, bry = _to_rel_coords(
            brx, bry, frame_size=frame_size, shape=shape, img=img
        )
        if clamp:
            tlx, tly = _clamp(tlx, tly)
            brx, bry = _clamp(brx, bry)

        width = brx - tlx
        height = bry - tly
        return cls(x=tlx, y=tly, width=width, height=height)


class RelativePoint(DynamicEmbeddedDocument):
    """A point in an image, represented as ``(x, y)`` coordinates in
    ``[0, 1] x [0, 1]``.

    Args:
        x: the x-coordinate in ``[0, 1]``
        y: the y-coordinate in ``[0, 1]``
    """

    meta = {"allow_inheritance": True}

    x = fof.FloatField()
    y = fof.FloatField()

    def __str__(self):
        # pylint: disable=bad-string-format-type
        return "(%.3f, %.3f)" % (self.x, self.y)

    def __eq__(self, other):
        return etan.is_close(self.x, other.x) and etan.is_close(
            self.y, other.y
        )

    def coords_in(self, frame_size=None, shape=None, img=None):
        """Returns the absolute ``(x, y)`` coordinates of this point in the
        specified image.

        Pass *one* keyword argument to this function.

        Args:
            frame_size (None): the ``(width, height)`` of the image
            shape (None): the ``(height, width, ...)`` of the image, e.g. from
                ``img.shape``
            img (None): the image itself

        Returns:
            absolute ``(x, y)`` coordinates
        """
        return _coords_in(
            self.x, self.y, frame_size=frame_size, shape=shape, img=img
        )

    def to_tuple(self):
        """Returns an ``(x, y)`` tuple representation of the point.

        Returns:
            an ``(x, y)`` tuple
        """
        return (self.x, self.y)

    @classmethod
    def from_coords(cls, x, y, clamp=True):
        """Constructs a :class:`RelativePoint` from ``(x, y)`` coordinates.

        Args:
            x: the x coordinate
            y: the y coordinate
            clamp (True): whether to clamp the point to ``[0, 1]`` if necessary

        Returns:
            a :class:`RelativePoint`
        """
        if clamp:
            x, y = _clamp(x, y)

        return cls(x=x, y=y)

    @classmethod
    def from_abs_coords(
        cls, x, y, clamp=True, frame_size=None, shape=None, img=None
    ):
        """Constructs a :class:`RelativePoint` from absolute ``(x, y)`` pixel
        coordinates.

        One of ``frame_size``, ``shape``, or ``img`` must be provided.

        Args:
            x: the x coordinate, in pixels
            y: the y coordinate, in pixels
            clamp (True): whether to clamp the point to ``[0, 1]`` if necessary
            frame_size (None): the ``(width, height)`` of the image
            shape (None): the ``(height, width, ...)`` of the image, e.g. from
                ``img.shape``
            img (None): the image itself

        Returns:
            a :class:`RelativePoint`
        """
        x, y = _to_rel_coords(
            x, y, frame_size=frame_size, shape=shape, img=img
        )
        return cls.from_coords(x, y, clamp=clamp)

    @classmethod
    def origin(cls):
        """Returns a :class:`RelativePoint` at the origin, ``(0, 0)``.

        Returns:
            a :class:`RelativePoint`
        """
        return cls(x=0, y=0)


def _clamp(x, y):
    return max(0, min(x, 1)), max(0, min(y, 1))


def _coords_in(x, y, frame_size=None, shape=None, img=None):
    w, h = _to_frame_size(frame_size=frame_size, shape=shape, img=img)
    return int(w * 1.0 * x), int(h * 1.0 * y)


def _to_rel_coords(x, y, frame_size=None, shape=None, img=None):
    w, h = _to_frame_size(frame_size=frame_size, shape=shape, img=img)
    x /= 1.0 * w
    y /= 1.0 * h
    return x, y


def _to_frame_size(frame_size=None, shape=None, img=None):
    if img is not None:
        shape = img.shape

    if shape is not None:
        return shape[1], shape[0]

    if frame_size is not None:
        return tuple(frame_size)

    raise TypeError("A valid keyword argument must be provided")


def _make_square(x, y, w, h):
    """Force the x, y slices into a square by expanding the smaller dimension.

    If the smaller dimension can't be expanded enough and still fit
    in the maximum allowed size, the larger dimension is contracted as needed.

    Args:
        x, y: slice objects
        w, h: the ``(width, height)`` of the maximum allowed size

    Returns:
        x and y slices that define a square
    """
    ws = x.stop - x.start
    hs = y.stop - y.start
    dx = hs - ws
    if dx < 0:
        return _make_square(y, x, h, w)[::-1]

    # subimage is now always skinny

    def pad(z, dz, zmax):
        dz1 = int(0.5 * dz)
        dz2 = dz - dz1
        ddz = max(0, dz1 - z.start) - max(0, z.stop + dz2 - zmax)
        return slice(z.start - dz1 + ddz, z.stop + dz2 + ddz)

    dy = min(0, w - dx - ws)
    return pad(x, dx + dy, w), pad(y, dy, h)
