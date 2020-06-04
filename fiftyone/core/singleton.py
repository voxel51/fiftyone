"""
FiftyOne singleton metaclasses.

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

import weakref


class DatasetSingleton(type):
    """Singleton metadata for :class:`fiftyone.core.dataset.Dataset`.

    Datasets are singletons keyed on unique dataset ``name``. This metaclass
    keeps a dictionary of weak references to instances keyed on ``name``.

    Note that new :class:`fiftyone.core.dataset.Dataset` instances are always
    created if the ``_create == True``.

    When the final strong reference to a dataset dies the weak reference dies
    and the dataset objects destructor is called.
    """

    def __new__(metacls, *args, **kwargs):
        cls = super(DatasetSingleton, metacls).__new__(
            metacls, *args, **kwargs
        )
        cls._instances = weakref.WeakValueDictionary()
        return cls

    def __call__(cls, name, _create=True, *args, **kwargs):
        if _create or name not in cls._instances:
            instance = cls.__new__(cls, name)
            instance.__init__(name, _create=_create, *args, **kwargs)
            cls._instances[name] = instance

        return cls._instances[name]
