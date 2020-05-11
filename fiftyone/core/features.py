"""
Dataset features.

| Copyright 2017-2020, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""
# pragma pylint: disable=redefined-builtin
# pragma pylint: disable=unused-wildcard-import
# pragma pylint: disable=wildcard-import
from __future__ import absolute_import
from __future__ import division
from __future__ import print_function
from __future__ import unicode_literals
from builtins import *

# pragma pylint: enable=redefined-builtin
# pragma pylint: enable=unused-wildcard-import
# pragma pylint: enable=wildcard-import


def compute_filehash(filepath):
    """Computes the file hash of the given file.

    Args:
        filepath: the path to the file

    Returns:
        the file hash
    """
    with open(filepath, "rb") as f:
        return hash(f.read())
