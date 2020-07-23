"""
Expressions for :class:`DatasetView` stage definitions.

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

import fiftyone.core.utils as fou


class ViewExpression(object):
    """An expression involving one or more fields of an object in a
    :class:`fiftyone.core.stages.ViewStage`.

    See `MongoDB expressions <https://docs.mongodb.com/manual/meta/aggregation-quick-reference/#aggregation-expressions>`_
    for more details.

    Typically, :class:`ViewExpression` instances are built by applying
    builtin operators to :class:`ViewField` instances.

    Args:
        expr: the MongoDB expression
    """

    def __init__(self, expr):
        self._expr = expr

    def __str__(self):
        return repr(self)

    def __repr__(self):
        return fou.pformat(self.to_mongo())

    def __len__(self):
        # Annoyingly, Python enforces deep in its depths that __len__ must
        # return an int. So, we cannot return our length expression here...
        raise TypeError(
            "Computing the length of an expression via `len()` is not "
            "allowed; use `expression.length()` instead"
        )

    def __getitem__(self, idx):
        return ViewExpression({"$arrayElemAt": [self, idx]})

    def __not__(self):
        return ViewExpression({"$not": self})

    def __and__(self, other):
        return ViewExpression({"$and": [self, other]})

    def __or__(self, other):
        return ViewExpression({"$or": [self, other]})

    def __eq__(self, other):
        return ViewExpression({"$eq": [self, other]})

    def __neq__(self, other):
        return ViewExpression({"$ne": [self, other]})

    def __gt__(self, other):
        return ViewExpression({"$gt": [self, other]})

    def __ge__(self, other):
        return ViewExpression({"$gte": [self, other]})

    def __lt__(self, other):
        return ViewExpression({"$lt": [self, other]})

    def __le__(self, other):
        return ViewExpression({"$lte": [self, other]})

    def __add__(self, other):
        return ViewExpression({"$add": [self, other]})

    def __radd__(self, other):
        return ViewExpression({"$add": [other, self]})

    def __sub__(self, other):
        return ViewExpression({"$subtract": [self, other]})

    def __rsub__(self, other):
        return ViewExpression({"$subtract": [other, self]})

    def __mul__(self, other):
        return ViewExpression({"$multiply": [self, other]})

    def __rmul__(self, other):
        return ViewExpression({"$multiply": [other, self]})

    def __div__(self, other):
        return ViewExpression({"$divide": [self, other]})

    def __rdiv__(self, other):
        return ViewExpression({"$divide": [other, self]})

    def __mod__(self, other):
        return ViewExpression({"$mod": [self, other]})

    def __rmod__(self, other):
        return ViewExpression({"$mod": [other, self]})

    def is_in(self, values):
        return ViewExpression({"$in": [self, list(values)]})

    def is_not_in(self, values):
        return ViewExpression({"$nin": [self, list(values)]})

    def length(self):
        """Computes thhe length of the expression, which must resolve to an
        array.

        If the expression is null, 0 is returned.

        Returns:
            a :class:`ViewExpression` that computes the length of the array
        """
        return ViewExpression({"$size": {"$ifNull": [self, []]}})

    def to_mongo(self, in_list=False):
        """Returns a MongoDB representation of the expression.

        Args:
            in_list (False): whether this expression is being used in the
                context of a list filter

        Returns:
            a MongoDB expression
        """
        return _recurse(self._expr, in_list)


class ViewField(ViewExpression):
    """A field of an object in a :class:`fiftyone.core.stages.ViewStage`.

    Args:
        name: the name of the field
    """

    def __init__(self, name):
        self.name = name

    def to_mongo(self, in_list=False):
        """Returns a MongoDB representation of the field.

        Args:
            in_list (False): whether this field is being used in the context of
                a list filter

        Returns:
            a string
        """
        return "$$this.%s" % self.name if in_list else "$" + self.name


def _recurse(val, in_list):
    if isinstance(val, ViewExpression):
        return val.to_mongo(in_list=in_list)
    if isinstance(val, dict):
        return {
            _recurse(k, in_list): _recurse(v, in_list) for k, v in val.items()
        }
    elif isinstance(val, list):
        return [_recurse(v, in_list) for v in val]
    else:
        return val
