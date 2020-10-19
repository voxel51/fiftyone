"""
Data structures for working with geometric objects like bounding boxes and
polylines.

| Copyright 2017-2020, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""
import fiftyone.core.fields as fof
from fiftyone.core.labels import Label


class HasBoundingBox(Label):
    """Mixin for :class:`Label` classes that expose a ``bounding_box`` property
    that contains bounding box coordinates stored as relative values in
    ``[0, 1]`` in the following format:

        [<top-left-x>, <top-left-y>, <width>, <height>]
    """

    meta = {"allow_inheritance": True}

    bounding_box = fof.ListField()

    @property
    def top_left(self):
        """The ``(x, y)`` coordinates of the top-left corner of the box."""
        # pylint: disable=unsubscriptable-object
        xtl = self.bounding_box[0]
        ytl = self.bounding_box[1]
        return xtl, ytl

    @property
    def top_right(self):
        """The ``(x, y)`` coordinates of the top-right corner of the box."""
        # pylint: disable=unsubscriptable-object
        xtr = self.bounding_box[0] + self.bounding_box[2]
        ytr = self.bounding_box[1]
        return xtr, ytr

    @property
    def bottom_left(self):
        """The ``(x, y)`` coordinates of the bottom-left corner of the box."""
        # pylint: disable=unsubscriptable-object
        xbl = self.bounding_box[0]
        ybl = self.bounding_box[1] + self.bounding_box[3]
        return xbl, ybl

    @property
    def bottom_right(self):
        """The ``(x, y)`` coordinates of the bottom-right corner of the box."""
        # pylint: disable=unsubscriptable-object
        xbr = self.bounding_box[0] + self.bounding_box[2]
        ybr = self.bounding_box[1] + self.bounding_box[3]
        return xbr, ybr

    @property
    def centroid(self):
        """The ``(x, y)`` coordinates of the centroid of the box."""
        # pylint: disable=unsubscriptable-object
        cx = self.bounding_box[0] + 0.5 * self.bounding_box[2]
        cy = self.bounding_box[1] + 0.5 * self.bounding_box[3]
        return (cx, cy)

    @property
    def width(self):
        """The width of the box in ``[0, 1]``."""
        # pylint: disable=unsubscriptable-object
        return self.bounding_box[2]

    @property
    def height(self):
        """The height of the box in ``[0, 1]``."""
        # pylint: disable=unsubscriptable-object
        return self.bounding_box[3]

    @property
    def area(self):
        """The area of the box, in ``[0, 1]``."""
        return self.width * self.height

    @property
    def is_proper(self):
        """Whether the bounding box is proper, i.e., its top-left coordinate
        lies to the left and above its bottom-right coordinate.
        """
        # pylint: disable=unsubscriptable-object
        return self.bounding_box[2] >= 0 and self.bounding_box[3] >= 0

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

        _xtl, _ytl = int(round(w * 1.0 * xtl)), int(round(h * 1.0 * ytl))
        _xbr, _ybr = int(round(w * 1.0 * xbr)), int(round(h * 1.0 * ybr))

        return _xtl, _ytl, (_xbr - _xtl), (_ybr - _ytl)

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
        tlx, tly = self.top_left
        brx, bry = self.bottom_right
        x1, y1 = _coords_in(tlx, tly, img=img)
        x2, y2 = _coords_in(brx, bry, img=img)
        x = slice(x1, x2)
        y = slice(y1, y2)

        if force_square:
            h, w = img.shape[:2]
            x, y = _make_square(x, y, w, h)

        return img[y, x, ...]

    def to_coords(self):
        """Returns a ``(x, y, width, height)`` tuple for the bounding box.

        Returns:
            a ``(x, y, width, height)`` tuple
        """
        return tuple(self.bounding_box)

    def pad_relative(self, alpha, clamp=True):
        """Returns a box whose length and width are expanded (or shrunk, when
        alpha < 0) by ``(100 * alpha)%``.

        Args:
            alpha: the desired padding relative to the size of this box; a
                float in ``[-1, \\inf)``
            clamp (True): whether to clamp the box to ``[0, 1] x [0, 1]`` if
                necessary

        Returns:
            the padded ``(x, y, width, height)`` tuple
        """
        x, y = self.top_left
        w = self.width
        h = self.height

        alpha = max(alpha, -1)
        wpad = 0.5 * alpha * w
        hpad = 0.5 * alpha * h

        tlx = x - wpad
        tly = y - hpad
        brx = x + w + wpad
        bry = y + h + hpad

        if clamp:
            tlx, tly = _clamp(tlx, tly)
            brx, bry = _clamp(brx, bry)

        return from_corners(tlx, tly, brx, bry)

    def get_intersection(self, box):
        """Returns a box describing the intersection of this box with the given
        box.

        If the bounding boxes do not intersect, ``(0, 0, 0, 0)`` is returned.

        Args:
            box: a :class:`HasBoundingBox`

        Returns:
            the intersection ``(x, y, width, height)`` tuple
        """
        x1, y1, w1, h1 = self.to_coords()
        x2, y2, w2, h2 = box.to_coords()
        tlx = max(x1, x2)
        tly = max(y1, y2)
        brx = min(x1 + w1, x2 + w2)
        bry = min(y1 + h1, y2 + h2)

        if (brx - tlx < 0) or (bry - tly < 0):
            return from_corners(0, 0, 0, 0)

        return from_corners(tlx, tly, brx, bry)

    def contains_box(self, box):
        """Determines if this box contains the given box.

        Args:
            box: a :class:`HasBoundingBox`

        Returns:
            True/False
        """
        return self.get_intersection(box) == box.to_coords()

    def compute_overlap(self, box):
        """Computes the proportion of this box that overlaps the given box.

        Args:
            box: a :class:`HasBoundingBox`

        Returns:
            the overlap in ``[0, 1]``
        """
        try:
            inter_coords = self.get_intersection(box)
            inter_area = inter_coords[2] * inter_coords[3]
            return inter_area / self.area
        except ZeroDivisionError:
            return 0.0

    def compute_iou(self, box):
        """Computes the IoU (intersection over union) of the boxes.

        The IoU is defined as the area of the intersection of the boxes divided
        by the area of their union.

        Args:
            box: a :class:`HasBoundingBox`

        Returns:
            the IoU in ``[0, 1]``
        """
        inter_coords = self.get_intersection(box)
        inter_area = inter_coords[2] * inter_coords[3]
        union_area = self.area + box.area - inter_area
        try:
            return inter_area / union_area
        except ZeroDivisionError:
            return 0.0


def from_coords(x, y, width, height, clamp=True):
    """Constructs a box from its relative coordinates.

    Args:
        x: the top-left x coordinate in ``[0, 1]``
        y: the top-left y coordinate in ``[0, 1]``
        width: the width of the box in ``[0, 1]``
        height: the height of the box in ``[0, 1]``
        clamp (True): whether to clamp the box to ``[0, 1] x [0, 1]`` if
            necessary

    Returns:
        a ``(x, y, width, height)`` tuple
    """
    if clamp:
        x, y = _clamp(x, y)
        brx, bry = _clamp(x + width, y + height)
        width, height = brx - x, bry - y

    return (x, y, width, height)


def from_abs_coords(
    x, y, width, height, clamp=True, frame_size=None, shape=None, img=None,
):
    """Constructs a box from absolute pixel coordinates.

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
        a ``(x, y, width, height)`` tuple
    """
    x, y = _to_rel_coords(x, y, frame_size=frame_size, shape=shape, img=img)
    brx, bry = _to_rel_coords(
        x + width, y + height, frame_size=frame_size, shape=shape, img=img
    )
    if clamp:
        x, y = _clamp(x, y)
        brx, bry = _clamp(brx, bry)

    width = brx - x
    height = bry - y

    return (x, y, width, height)


def from_corners(tlx, tly, brx, bry, clamp=True):
    """Constructs a box from top-left and bottom-right relative coordinates.

    Args:
        tlx: the top-left x coordinate in ``[0, 1]``
        tly: the top-left y coordinate in ``[0, 1]``
        brx: the bottom-right x coordinate in ``[0, 1]``
        bry: the bottom-right y coordinate in ``[0, 1]``
        clamp (True): whether to clamp the box to ``[0, 1] x [0, 1]`` if
            necessary

    Returns:
        a ``(x, y, width, height)`` tuple
    """
    if clamp:
        tlx, tly = _clamp(tlx, tly)
        brx, bry = _clamp(brx, bry)

    width = brx - tlx
    height = bry - tly

    return (tlx, tly, width, height)


def from_abs_corners(
    tlx, tly, brx, bry, clamp=True, frame_size=None, shape=None, img=None,
):
    """Constructs a box from top-left and bottom-right pixel coordinates.

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
        a ``(x, y, width, height)`` tuple
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

    return (tlx, tly, width, height)


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
