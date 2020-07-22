"""
List filters.

Helper functions for generating `cond` filter dictionaries used by
:class:`fiftyone.core.view.DatasetView.add_list_filter()`

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


def _comparison(func):
    """Decorator for comparison queries that completely overrides
    functionality.
    """

    def wrapper(field_name_or_exp, value):
        return _compare(func.__name__, field_name_or_exp, value)

    return wrapper


def logical_not(cond):
    return {"$not": cond}


def logical_and(conds):
    return {"$and": conds}


def logical_or(conds):
    return {"$or": conds}


@_comparison
def eq():
    pass


@_comparison
def ne():
    pass


@_comparison
def gt():
    pass


@_comparison
def gte():
    pass


@_comparison
def lt():
    pass


@_comparison
def lte():
    pass


def bbox_area():
    return {
        "$multiply": [
            {"$arrayElemAt": ["$$this.bounding_box", 2]},
            {"$arrayElemAt": ["$$this.bounding_box", 3]},
        ]
    }


def _compare(comparator, field_name_or_exp, value):
    if isinstance(field_name_or_exp, str):
        return {"$" + comparator: ["$$this." + field_name_or_exp, value]}
    return {"$" + comparator: [field_name_or_exp, value]}
