"""
Frame utilites.

| Copyright 2017-2021, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""
import six


def is_frame_number(value):
    """Determines whether the provided value is a frame number.

    Frame numbers are strictly positive integers.

    Args:
        value: a value

    Returns:
        True/False

    Raises:
        :class:`FrameError`: if ``value`` is an integer but is not strictly
            positive
    """
    if isinstance(value, six.integer_types):
        if value < 1:
            raise FrameError(
                "Frame numbers must be integers; found %s" % type(value)
            )

        return True

    return False


def validate_frame_number(value):
    """Validates that the provided value is a frame number.

    Frame numbers are strictly positive integers.

    Args:
        value: a value

    Raises:
        :class:`FrameError`: if ``value`` is not a frame number
    """
    if not isinstance(value, six.integer_types):
        raise FrameError(
            "Frame numbers must be integers; found %s" % type(value)
        )

    if value < 1:
        raise FrameError(
            "Frame numbers must be 1-based integers; found %s" % value
        )


class FrameError(Exception):
    """Exception raised when an invalid frame number is encountered."""

    pass
