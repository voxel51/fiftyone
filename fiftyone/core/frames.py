"""
Frame labels.

| Copyright 2017-2020, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""
from collections import defaultdict

import six

from fiftyone.core.odm import SerializableDocument, DynamicDocument


class NoDatasetFrames(defaultdict):
    def __init__(self):
        super().__init__(FrameSample)

    def __getitem__(self, key):
        if not isinstance(key, six.integer_types) or key < 0:
            raise FrameError("invalid frame key")
        return super().__getitem__(key)

    def __setitem__(self, key, value):
        if not isinstance(key, six.integer_types) or key < 0:
            raise FrameError("invalid frame key")

        if not isinstance(value, FrameSample):
            raise FrameError("invalid frame value")

        super().__setitem__(key, value)


class FrameSample(DynamicDocument):

    pass


class FrameError(Exception):

    pass
