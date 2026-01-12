"""
Test that the fiftyone core package does not depend on any extra packages that
are intended to be manually installed by users.

| Copyright 2017-2025, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""

import sys
from types import ModuleType


class _UnavailableModule(ModuleType):
    """A module placeholder that simulates an unavailable optional dependency.

    Returns placeholder classes for attribute access that:
    - Won't match real types in isinstance/issubclass checks (returns False)
    - Raise ModuleNotFoundError when actually used (instantiated, called, etc.)
    """

    def __init__(self, name):
        super().__init__(name)
        self._name = name
        self._cache = {}

    def _make_placeholder(self, attr):
        """Create a placeholder class that raises on actual use."""
        module_name = self._name

        class _Placeholder:
            def __init__(self, *args, **kwargs):
                raise ModuleNotFoundError(f"No module named '{module_name}'")

            def __call__(self, *args, **kwargs):
                raise ModuleNotFoundError(f"No module named '{module_name}'")

        return _Placeholder

    def __getattr__(self, attr):
        if attr not in self._cache:
            self._cache[attr] = self._make_placeholder(attr)
        return self._cache[attr]


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
