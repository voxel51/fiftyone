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


class ViewExpression(object):
    """An expression involving one or more fields of an object in a
    :class:`fiftyone.core.stages.ViewStage`.

    See `MongoDB expressions <https://docs.mongodb.com/manual/meta/aggregation-quick-reference/#aggregation-expressions>`_
    for more details.

    Typically, :class:`ViewExpression` instances are built by applying
    builtin operators to :class:`ViewField` instances.

    .. automethod:: __eq__
    .. automethod:: __ge__
    .. automethod:: __gt__
    .. automethod:: __le__
    .. automethod:: __lt__
    .. automethod:: __ne__
    .. automethod:: __and__
    .. automethod:: __invert__
    .. automethod:: __or__
    .. automethod:: __abs__
    .. automethod:: __add__
    .. automethod:: __ceil__
    .. automethod:: __floor__
    .. automethod:: __round__
    .. automethod:: __mod__
    .. automethod:: __mul__
    .. automethod:: __pow__
    .. automethod:: __sub__
    .. automethod:: __truediv__
    .. automethod:: __getitem__

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

        Returns:
            a MongoDB expression
        """
        return ViewExpression._recurse(self._expr, in_list)

    # Comparison Expression Operators

    def __eq__(self, other):
        """Creates an expression that returns a boolean indicating whether:
            `<resolved expression> == <other>`

        Args:
            other: a :class:`ViewExpression` or a python primitive understood
                by MongoDB

        Returns:
            a :class:`ViewExpression`
        """
        return ViewExpression({"$eq": [self, other]})

    def __ge__(self, other):
        """Creates an expression that returns a boolean indicating whether:
            `<resolved expression> >= <other>`

        Args:
            other: a :class:`ViewExpression` or a python primitive understood
                by MongoDB

        Returns:
            a :class:`ViewExpression`
        """
        return ViewExpression({"$gte": [self, other]})

    def __gt__(self, other):
        """Creates an expression that returns a boolean indicating whether:
            `<resolved expression> > <other>`

        Args:
            other: a :class:`ViewExpression` or a python primitive understood
                by MongoDB

        Returns:
            a :class:`ViewExpression`
        """
        return ViewExpression({"$gt": [self, other]})

    def __le__(self, other):
        """Creates an expression that returns a boolean indicating whether:
            `<resolved expression> <= <other>`

        Args:
            other: a :class:`ViewExpression` or a python primitive understood
                by MongoDB

        Returns:
            a :class:`ViewExpression`
        """
        return ViewExpression({"$lte": [self, other]})

    def __lt__(self, other):
        """Creates an expression that returns a boolean indicating whether:
            `<resolved expression> < <other>`

        Args:
            other: a :class:`ViewExpression` or a python primitive understood
                by MongoDB

        Returns:
            a :class:`ViewExpression`
        """
        return ViewExpression({"$lt": [self, other]})

    def __ne__(self, other):
        """Creates an expression that returns a boolean indicating whether:
            `<resolved expression> != <other>`

        Args:
            other: a :class:`ViewExpression` or a python primitive understood
                by MongoDB

        Returns:
            a :class:`ViewExpression`
        """
        return ViewExpression({"$ne": [self, other]})

    # Logic Expression Operators

    def __and__(self, other):
        """Creates an expression that returns a boolean that is a logical
        combination:
            `<resolved expression> AND <other>`

        Args:
            other: a :class:`ViewField` or :class:`ViewExpression`

        Returns:
            a :class:`ViewExpression`
        """
        return ViewExpression({"$and": [self, other]})

    def __invert__(self):
        """Creates an expression that returns a boolean that the logical
        inverse of this expression:
            `NOT <resolved expression>`

        Returns:
            a :class:`ViewExpression`
        """
        return ViewExpression({"$not": self})

    def __or__(self, other):
        """Creates an expression that returns a boolean that is a logical
        combination:
            `<resolved expression> OR <other>`

        Args:
            other: a :class:`ViewField` or :class:`ViewExpression`

        Returns:
            a :class:`ViewExpression`
        """
        return ViewExpression({"$or": [self, other]})

    def __rand__(self, other):
        return ViewExpression({"$and": [other, self]})

    def __ror__(self, other):
        return ViewExpression({"$or": [other, self]})

    # Arithmetic Expression Operators

    def __abs__(self):
        """Creates an expression that returns a number that is the absolute
        value of this expression.

        Returns:
            a :class:`ViewExpression`
        """
        return ViewExpression({"$abs": self})

    def __add__(self, other):
        """Creates an expression that returns a number that is:
            `<resolved expression> + <other>`

        Args:
            other: a :class:`ViewField`, :class:`ViewExpression` or numeric

        Returns:
            a :class:`ViewExpression`
        """
        return ViewExpression({"$add": [self, other]})

    def __ceil__(self):
        """Creates an expression that returns a number that is the CEIL of this
        expression.

        Returns:
            a :class:`ViewExpression`
        """
        return ViewExpression({"$ceil": self})

    def __floor__(self):
        """Creates an expression that returns a number that is the FLOOR of
        this expression.

        Returns:
            a :class:`ViewExpression`
        """
        return ViewExpression({"$floor": self})

    def __round__(self, place=0):
        """Creates an expression that returns a number that is the rounded
        value of this expression.

        Args:
            place: the decimal place at which to round. Must be an integer
                in range -20 < place < 100.

                Positive values will round to `place` decimal places:
                    e.g. `place=2`  1234.5678 --> 1234.57

                Negative values will round digits left of the decimal with 0.
                    e.g.  `place=-2`  1234.5678 --> 1200

        Returns:
            a :class:`ViewExpression`
        """
        return ViewExpression({"$round": [self, place]})

    def __mod__(self, other):
        """Creates an expression that returns a number that is:
            `<resolved expression> % <other>`

        Args:
            other: a :class:`ViewField`, :class:`ViewExpression` or numeric

        Returns:
            a :class:`ViewExpression`
        """
        return ViewExpression({"$mod": [self, other]})

    def __mul__(self, other):
        """Creates an expression that returns a number that is:
            `<resolved expression> * <other>`

        Args:
            other: a :class:`ViewField`, :class:`ViewExpression` or numeric

        Returns:
            a :class:`ViewExpression`
        """
        return ViewExpression({"$multiply": [self, other]})

    def __pow__(self, power, modulo=None):
        """Creates an expression that returns a number that is the value of
        this expression raised to the `power`.

        Args:
            power: the power that the resolved expression is raised to
            module: unused arg

        Returns:
            a :class:`ViewExpression`
        """
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
        """Creates an expression that returns a number that is:
            `<resolved expression> - <other>`

        Args:
            other: a :class:`ViewField`, :class:`ViewExpression` or numeric

        Returns:
            a :class:`ViewExpression`
        """
        return ViewExpression({"$subtract": [self, other]})

    def __truediv__(self, other):
        """Creates an expression that returns a number that is:
            `<resolved expression> - <other>`

        Args:
            other: a :class:`ViewField`, :class:`ViewExpression` or numeric

        Returns:
            a :class:`ViewExpression`
        """
        return ViewExpression({"$divide": [self, other]})

    def exp(self):
        """Creates an expression that raises Euler’s number to the specified
        exponent and returns the result.

        Returns:
            a :class:`ViewExpression`
        """
        return ViewExpression({"$exp": self})

    def ln(self):
        """Creates an expression that calculates the natural logarithm of a
        number and returns the result.

        Returns:
            a :class:`ViewExpression`
        """
        return ViewExpression({"$ln": self})

    def log(self, base):
        """Creates an expression that calculates the log of a number in the
        specified base and returns the result.

        Args:
            base: the base to compute the log on

        Returns:
            a :class:`ViewExpression`
        """
        return ViewExpression({"$log": [self, base]})

    def log10(self):
        """Creates an expression that calculates the log base 10 of a number
        and returns the result.

        Returns:
            a :class:`ViewExpression`
        """
        return ViewExpression({"$log10": self})

    def sqrt(self):
        """Creates an expression that calculates the square root of a positive
        number and returns the result.

        Returns:
            a :class:`ViewExpression`
        """
        return ViewExpression({"$sqrt": self})

    def trunc(self, place=0):
        """Creates an expression that truncates a number to a specified
        decimal place.

        Args:
            place: the decimal place at which to truncate. Must be an integer
                in range -20 < place < 100.

                Positive values will truncate to `place` decimal places:
                    e.g. `place=2`  1234.5678 --> 1234.56

                Negative values replace digits left of the decimal with 0.
                    e.g.  `place=-2`  1234.5678 --> 1200

        Returns:
            a :class:`ViewExpression`
        """
        return ViewExpression({"$trunc": [self, place]})

    # Array Expression Operators

    def __getitem__(self, idx):
        return ViewExpression({"$arrayElemAt": [self, idx]})

    def is_in(self, values):
        """Creates an expression that returns a boolean indicating whether
        the resolved expression is in the array of values.

        Args:
            values: a list of values to check if the resolved value of this
                expression is in

        Returns:
            a :class:`ViewExpression`
        """
        return ViewExpression({"$in": [self, list(values)]})

    def contains(self, value):
        """Creates an expression that returns a boolean indicating whether the
        specified value is in the resolved array expression.

        Args:
            value: the value to check if it is contained in the resolved list
                from this expression

        Returns:
            a :class:`ViewExpression`
        """
        return ViewExpression({"$in": [value, self]})

    @staticmethod
    def _recurse(val, in_list):
        if isinstance(val, ViewExpression):
            return val.to_mongo(in_list=in_list)

        if isinstance(val, dict):
            return {
                ViewExpression._recurse(k, in_list): ViewExpression._recurse(
                    v, in_list
                )
                for k, v in val.items()
            }

        if isinstance(val, list):
            return [ViewExpression._recurse(v, in_list) for v in val]

        return val


class ViewField(ViewExpression):
    """A field of an object in a :class:`fiftyone.core.stages.ViewStage`.

    .. automethod:: __eq__
    .. automethod:: __ge__
    .. automethod:: __gt__
    .. automethod:: __le__
    .. automethod:: __lt__
    .. automethod:: __ne__
    .. automethod:: __and__
    .. automethod:: __invert__
    .. automethod:: __or__
    .. automethod:: __abs__
    .. automethod:: __add__
    .. automethod:: __ceil__
    .. automethod:: __floor__
    .. automethod:: __round__
    .. automethod:: __mod__
    .. automethod:: __mul__
    .. automethod:: __pow__
    .. automethod:: __sub__
    .. automethod:: __truediv__
    .. automethod:: __getitem__

    Args:
        expr: the name of the field
    """

    def __init__(self, expr):
        if not isinstance(expr, str):
            raise TypeError()
        super().__init__(expr)

    def to_mongo(self, in_list=False):
        """Returns a MongoDB representation of the field.

        Args:
            in_list (False): whether this field is being used in the context of
                a list filter

        Returns:
            a string
        """
        return "$$this.%s" % self._expr if in_list else "$" + self._expr
