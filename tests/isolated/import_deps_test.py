"""
Test that the fiftyone core package does not depend on any extra packages that
are intended to be manually installed by users.

| Copyright 2017-2025, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""
import sys

import pytest


#
# This is a list of modules that are used (typically by utilities) but which
# are not distributed as part of the main FiftyOne package. If a user uses a
# feature that requires them, they must manually install the packages
#
# https://docs.python.org/3/reference/import.html#the-module-cache
#
del sys.modules["tensorflow"]
del sys.modules["tensorflow_datasets"]
del sys.modules["torch"]
del sys.modules["torchvision"]
del sys.modules["flash"]
del sys.modules["pycocotools"]


def test_import_core():
    # This should not raise an ImportError, i.e. should not depend on any of
    # the modules disabled above
    import fiftyone
