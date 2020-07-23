"""
FiftyOne :class:`MatchExpression` definition.

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


class MatchExpression(object):
    """A field or expression that represents a part or whole of a MongoDB
    Aggregation Pipeline Expression in a
    :class:`fiftyone.core.stages.ViewStage`.

    This class provides convenient syntax that wraps the functionality
    supported here:
    https://docs.mongodb.com/manual/reference/operator/aggregation/

    Args:
        field_or_expr: the name of the field or the MongoDB expression defining
            the condition
    """

    def __init__(self, field_or_expr):
        self.field_or_expr = field_or_expr

    @property
    def is_field(self):
        return isinstance(self.field_or_expr, str)

    @property
    def is_expr(self):
        return not self.is_field

    def __str__(self):
        return repr(self)

    def __repr__(self):
        return fou.pformat(self.to_mongo())

    def to_mongo(self, in_list=False):
        """Returns a MongoDB representation of the field/expression.

        Args:
            in_list (False): whether this field is being used in the context of
                a list filter

        Returns:
            a MongoDB str/dict
        """
        if self.is_field:
            return (
                "$$this.%s" % self.field_or_expr
                if in_list
                else "$" + self.field_or_expr
            )
        return self._recurse(self.field_or_expr, in_list)

    # Comparison Expression Operators

    def __eq__(self, other):
        return MatchExpression({"$eq": [self, other]})

    def __ge__(self, other):
        return MatchExpression({"$gte": [self, other]})

    def __gt__(self, other):
        return MatchExpression({"$gt": [self, other]})

    def __le__(self, other):
        return MatchExpression({"$lte": [self, other]})

    def __lt__(self, other):
        return MatchExpression({"$lt": [self, other]})

    def __ne__(self, other):
        return MatchExpression({"$ne": [self, other]})

    # Logic Expression Operators

    def __and__(self, other):
        return MatchExpression({"$and": [self, other]})

    def __invert__(self):
        return MatchExpression({"$not": self})

    def __or__(self, other):
        return MatchExpression({"$or": [self, other]})

    # Arithmetic Expression Operators

    def __abs__(self):
        return MatchExpression({"$abs": self})

    def __add__(self, other):
        return MatchExpression({"$add": [self, other]})

    def __ceil__(self):
        return MatchExpression({"$ceil": self})

    def __floor__(self):
        return MatchExpression({"$floor": self})

    def __round__(self, n=0):
        return MatchExpression({"$round": [self, n]})

    def __mod__(self, other):
        return MatchExpression({"$mod": [self, other]})

    def __mul__(self, other):
        return MatchExpression({"$multiply": [self, other]})

    __rmul__ = __mul__

    def __pow__(self, power, modulo=None):
        return MatchExpression({"pow": [self, power]})

    def __sub__(self, other):
        return MatchExpression({"$subtract": [self, other]})

    def __truediv__(self, other):
        return MatchExpression({"$divide": [self, other]})

    def exp(self):
        """Raises Euler’s number (i.e. e ) to the specified exponent and
        returns the result.
        """
        return MatchExpression({"$exp": self})

    def ln(self):
        """Calculates the natural logarithm ln (i.e log_e) of a number and
        returns the result.
        """
        return MatchExpression({"$ln": self})

    def log(self, base):
        """Calculates the log of a number in the specified base and returns the
        result.
        """
        return MatchExpression({"$log": [self, base]})

    def log10(self):
        """Calculates the log base 10 of a number and returns the result."""
        return MatchExpression({"$log10": self})

    def sqrt(self):
        """Calculates the square root of a positive number and returns the
        result.
        """
        return MatchExpression({"$sqrt": self})

    def trunc(self, place=0):
        """Truncates a number to a specified decimal place."""
        return MatchExpression({"$trunc": [self, place]})

    # Array Expression Operators

    def __getitem__(self, idx):
        return MatchExpression({"$arrayElemAt": [self, idx]})

    def is_in(self, values):
        """Returns a boolean indicating whether the expression is in the
        array of values
        """
        return MatchExpression({"$in": [self, list(values)]})

    def contains(self, value):
        """Returns a boolean indicating whether the specified value is in the
        array field/expression.
        """
        return MatchExpression({"$in": [value, self]})

    @staticmethod
    def _recurse(val, in_list):
        if isinstance(val, (MatchExpression, MatchExpression)):
            return val.to_mongo(in_list=in_list)
        if isinstance(val, dict):
            return {
                MatchExpression._recurse(k, in_list): MatchExpression._recurse(
                    v, in_list
                )
                for k, v in val.items()
            }
        elif isinstance(val, list):
            return [MatchExpression._recurse(v, in_list) for v in val]
        else:
            return val
