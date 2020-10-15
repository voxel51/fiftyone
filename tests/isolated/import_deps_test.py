"""
Test that the fiftyone core does not depend on Tensorflow or PyTorch.

| Copyright 2017-2020, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""
import sys

import pytest


# raise an ImportError if any of these modules are imported
# https://docs.python.org/3/reference/import.html#the-module-cache
sys.modules["tensorflow"] = None
sys.modules["tensorflow_datasets"] = None
sys.modules["torch"] = None
sys.modules["torchvision"] = None


def test_import_core():
    # should not raise an ImportError, i.e. should not depend on the modules
    # disabled above
    import fiftyone


def test_import_tf():
    with pytest.raises(ImportError) as exc_info:
        import fiftyone.utils.tf

    assert exc_info.value.name == "tensorflow"


def test_import_torch():
    with pytest.raises(ImportError) as exc_info:
        import fiftyone.utils.torch

    assert exc_info.value.name == "torch"
