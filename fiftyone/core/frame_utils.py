"""
Frame utilites.

| Copyright 2017-2020, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""
from collections import defaultdict

import six


def is_frame_number(value):
    if isinstance(value, six.integer_types):
        if value < 0:
            raise FrameError("positive ints only")
        return True
    return False


class FrameError(Exception):

    pass
