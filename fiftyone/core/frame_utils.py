"""
Frame utilites.

| Copyright 2017-2020, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""
from collections import defaultdict

import six


def is_frame_number(value):
    """Determines whether the provided value is a frame number.

    Frame numbers are strictly positive integers.

    Args:
        value: an arbitrary value

    Returns:
        True/False

    Raises:
        :class:`FrameError` if ``value`` is an integer but is not strictly
        positive
    """
    if isinstance(value, six.integer_types):
        if value < 1:
            raise FrameError(
                "Frame numbers must be 1-based integers; found %d" % value
            )

        return True

    return False


class FrameError(Exception):
    """Exception raised when an invalid frame number is encountered."""

    pass
