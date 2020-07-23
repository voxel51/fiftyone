"""
Expressions for :class:`fiftyone.core.stages.ViewStage` definitions.

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


class _ViewExpression(object):
    """Base class that ViewField and ViewExpression inherit from. Specifies
    operations that can be applied to either.
    """

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

    def length(self):
        """Computes the length of the expression, which must resolve to an
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
        """
        raise NotImplementedError("Subclass must implement `to_mongo`")

    # Comparison Expression Operators

    def __eq__(self, other):
        return ViewExpression({"$eq": [self, other]})

    def __ge__(self, other):
        return ViewExpression({"$gte": [self, other]})

    def __gt__(self, other):
        return ViewExpression({"$gt": [self, other]})

    def __le__(self, other):
        return ViewExpression({"$lte": [self, other]})

    def __lt__(self, other):
        return ViewExpression({"$lt": [self, other]})

    def __ne__(self, other):
        return ViewExpression({"$ne": [self, other]})

    # Logic Expression Operators

    def __and__(self, other):
        return ViewExpression({"$and": [self, other]})

    def __invert__(self):
        return ViewExpression({"$not": self})

    def __or__(self, other):
        return ViewExpression({"$or": [self, other]})

    def __rand__(self, other):
        return ViewExpression({"$and": [other, self]})

    def __ror__(self, other):
        return ViewExpression({"$or": [other, self]})

    # Arithmetic Expression Operators

    def __abs__(self):
        return ViewExpression({"$abs": self})

    def __add__(self, other):
        return ViewExpression({"$add": [self, other]})

    def __ceil__(self):
        return ViewExpression({"$ceil": self})

    def __floor__(self):
        return ViewExpression({"$floor": self})

    def __round__(self, n=0):
        return ViewExpression({"$round": [self, n]})

    def __mod__(self, other):
        return ViewExpression({"$mod": [self, other]})

    def __mul__(self, other):
        return ViewExpression({"$multiply": [self, other]})

    def __pow__(self, power, modulo=None):
        return ViewExpression({"pow": [self, power]})

    def __radd__(self, other):
        return ViewExpression({"$add": [other, self]})

    def __rmod__(self, other):
        return ViewExpression({"$mod": [other, self]})

    def __rmul__(self, other):
        return ViewExpression({"$multiply": [other, self]})

    def __rsub__(self, other):
        return ViewExpression({"$subtract": [other, self]})

    def __rtruediv__(self, other):
        return ViewExpression({"$divide": [other, self]})

    def __sub__(self, other):
        return ViewExpression({"$subtract": [self, other]})

    def __truediv__(self, other):
        return ViewExpression({"$divide": [self, other]})

    def exp(self):
        """Raises Euler’s number (i.e. e ) to the specified exponent and
        returns the result.
        """
        return ViewExpression({"$exp": self})

    def ln(self):
        """Calculates the natural logarithm ln (i.e log_e) of a number and
        returns the result.
        """
        return ViewExpression({"$ln": self})

    def log(self, base):
        """Calculates the log of a number in the specified base and returns the
        result.
        """
        return ViewExpression({"$log": [self, base]})

    def log10(self):
        """Calculates the log base 10 of a number and returns the result."""
        return ViewExpression({"$log10": self})

    def sqrt(self):
        """Calculates the square root of a positive number and returns the
        result.
        """
        return ViewExpression({"$sqrt": self})

    def trunc(self, place=0):
        """Truncates a number to a specified decimal place."""
        return ViewExpression({"$trunc": [self, place]})

    # Array Expression Operators

    def __getitem__(self, idx):
        return ViewExpression({"$arrayElemAt": [self, idx]})

    def is_in(self, values):
        """Returns a boolean indicating whether the expression is in the
        array of values
        """
        return ViewExpression({"$in": [self, list(values)]})

    def contains(self, value):
        """Returns a boolean indicating whether the specified value is in the
        array field/expression.
        """
        return ViewExpression({"$in": [value, self]})

    @staticmethod
    def _recurse(val, in_list):
        if isinstance(val, _ViewExpression):
            return val.to_mongo(in_list=in_list)

        if isinstance(val, dict):
            return {
                _ViewExpression._recurse(k, in_list): _ViewExpression._recurse(
                    v, in_list
                )
                for k, v in val.items()
            }

        if isinstance(val, list):
            return [_ViewExpression._recurse(v, in_list) for v in val]

        return val


class ViewField(_ViewExpression):
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


class ViewExpression(_ViewExpression):
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

    def to_mongo(self, in_list=False):
        """Returns a MongoDB representation of the expression.

        Args:
            in_list (False): whether this expression is being used in the
                context of a list filter

        Returns:
            a MongoDB expression
        """
        return ViewExpression._recurse(self._expr, in_list)
