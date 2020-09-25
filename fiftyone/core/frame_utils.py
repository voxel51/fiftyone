"""
Frame utilites.

| Copyright 2017-2020, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""
from collections import defaultdict

import six


class NoDatasetFrames(defaultdict):
    def __init__(self):
        from fiftyone.core.odm.sample import FrameSample

        super().__init__(FrameSample)

    def __getitem__(self, key):
        return super().__getitem__(key)
        from fiftyone.core.odm.sample import FrameSample

        if not isinstance(key, six.integer_types) or key < 0:
            raise FrameError("invalid frame key")

    def __setitem__(self, key, value):
        from fiftyone.core.odm.sample import FrameSample

        super().__setitem__(key, value)
        return
        if not isinstance(key, six.integer_types) or key < 0:
            raise FrameError("invalid frame key")

        if not isinstance(value, FrameSample):
            raise FrameError("invalid frame value")


def is_frame_number(value):
    if isinstance(value, six.integer_types):
        if value < 0:
            raise FrameError("positive ints only")
        return True
    return False


class FrameError(Exception):

    pass
