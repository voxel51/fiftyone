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
from future.utils import iteritems, itervalues

# pragma pylint: enable=redefined-builtin
# pragma pylint: enable=unused-wildcard-import
# pragma pylint: enable=wildcard-import

import logging
import weakref


logger = logging.getLogger(__name__)


class DatasetSingleton(type):
    """FiftyOne Dataset Per-'name' Singleton Metaclass.

    Datasets are singletons keyed on unique dataset 'name'. This metaclass
    keeps a dictionary of weak references to instances keyed on 'name'.

    When the final strong reference to a dataset dies the weak reference dies
    and the dataset objects destructor is called.
    """

    def __new__(metacls, *args, **kwargs):
        cls = super(DatasetSingleton, metacls).__new__(
            metacls, *args, **kwargs
        )
        cls._instances = {}
        return cls

    def __call__(cls, name, *args, **kwargs):
        if name in cls._instances:
            # de-reference the weakref
            inst = cls._instances[name]
            inst = inst and inst()
        else:
            inst = None

        if inst is None:
            inst = cls.__new__(cls, name, *args, **kwargs)
            inst.__init__(name, *args, **kwargs)
            cls._instances[name] = weakref.ref(inst)

        return inst
