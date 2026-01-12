"""
Test that the fiftyone core package does not depend on any extra packages that
are intended to be manually installed by users.

| Copyright 2017-2026, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""

import sys
from types import ModuleType


class _UnavailableModule(ModuleType):
    """A module placeholder that raises ModuleNotFoundError on attribute access."""

    def __init__(self, name):
        super().__init__(name)
        self._name = name

    def __getattr__(self, attr):
        raise ModuleNotFoundError(f"No module named '{self._name}'")


#
# This is a list of modules that are used (typically by utilities) but which
# are not distributed as part of the main FiftyOne package. If a user uses a
# feature that requires them, they must manually install the packages
#
# https://docs.python.org/3/reference/import.html#the-module-cache
#
sys.modules["tensorflow"] = _UnavailableModule("tensorflow")
sys.modules["tensorflow_datasets"] = _UnavailableModule("tensorflow_datasets")
sys.modules["torch"] = _UnavailableModule("torch")
sys.modules["torchvision"] = _UnavailableModule("torchvision")
sys.modules["flash"] = _UnavailableModule("flash")
sys.modules["pycocotools"] = _UnavailableModule("pycocotools")


def test_import_core():
    # This should not raise an ImportError, i.e. should not depend on any of
    # the modules disabled above
    import fiftyone
