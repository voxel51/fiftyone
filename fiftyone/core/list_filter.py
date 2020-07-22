"""
List filters.

Helper functions for generating `cond` filter dictionaries used by
:class:`fiftyone.core.view.DatasetView.add_list_filter()`

Each of the functions in this submodule returns a value input for the `cond`
arg of :class:`fiftyone.core.view.DatasetView.add_list_filter()`.

Example usage equivalent to
    (
        my_detections.detections.label == "friend"
        AND
        my_detections.detections.label > 0.5
    )
    OR
    my_detections.detections.<bounding_box area> <= 0.05

```
import fiftyone.core.list_filter as folf

view = (
    dataset.view()
    .add_list_filter(
        field_name="my_detections.detections",
        cond=folf.logical_or(
            [
                folf.logical_and(
                    [folf.eq("label", "friend"), folf.gt("confidence", 0.5)]
                ),
                folf.lte(folf.bbox_area(), 0.05),
            ]
        ),
    )
)
```

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
    """Decorator for comparison queries that overrides functionality."""

    def wrapper(field_name_or_expr, value):
        return _compare(func.__name__, field_name_or_expr, value)

    return wrapper


def logical_not(cond):
    """Applies a logical `not` to a filter expression.

    Args:
         cond: a list of MongoDB aggregation filter expressions

    Returns:
         (dict) a MongoDB aggregation filter expression
    """
    return {"$not": cond}


def logical_and(conds):
    """Applies a logical `and` to a list of filter expressions.

    Args:
         conds: a list of MongoDB aggregation filter expressions

    Returns:
         (dict) a MongoDB aggregation filter expression
    """
    return {"$and": conds}


def logical_or(conds):
    """Applies a logical `or` to a list of filter expressions.

    Args:
         conds: a list of MongoDB aggregation filter expressions

    Returns:
         (dict) a MongoDB aggregation filter expression
    """
    return {"$or": conds}


@_comparison
def eq():
    """Compares: field (or resultant of the expression) == `value`

    Args:
         field_name_or_expr: either:
            (str) the name of a list field
            (dict) a filter expression
         value: the value to compare against

    Returns:
         (dict) a MongoDB aggregation filter expression
    """
    pass


@_comparison
def ne():
    """Compares: field (or resultant of the expression) != `value`

    Args:
         field_name_or_expr: either:
            (str) the name of a list field
            (dict) a filter expression
         value: the value to compare against

    Returns:
         (dict) a MongoDB aggregation filter expression
    """
    pass


@_comparison
def gt():
    """Compares: field (or resultant of the expression) > `value`

    Args:
         field_name_or_expr: either:
            (str) the name of a list field
            (dict) a filter expression
         value: the value to compare against

    Returns:
         (dict) a MongoDB aggregation filter expression
    """
    pass


@_comparison
def gte():
    """Compares: field (or resultant of the expression) >= `value`

    Args:
         field_name_or_expr: either:
            (str) the name of a list field
            (dict) a filter expression
         value: the value to compare against

    Returns:
         (dict) a MongoDB aggregation filter expression
    """
    pass


@_comparison
def lt():
    """Compares: field (or resultant of the expression) < `value`

    Args:
         field_name_or_expr: either:
            (str) the name of a list field
            (dict) a filter expression
         value: the value to compare against

    Returns:
         (dict) a MongoDB aggregation filter expression
    """
    pass


@_comparison
def lte():
    """Compares: field (or resultant of the expression) <= `value`

    Args:
         field_name_or_expr: either:
            (str) the name of a list field
            (dict) a filter expression
         value: the value to compare against

    Returns:
         (dict) a MongoDB aggregation filter expression
    """
    pass


def bbox_area():
    """Expression that resolves to the area of the bounding_box. Only to be
    used when filtering :class:`fiftyone.core.labels.Detections` fields.

    Returns:
         (dict) a MongoDB aggregation filter expression
    """
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
