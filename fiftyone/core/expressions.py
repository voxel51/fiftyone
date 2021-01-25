"""
Expressions for :class:`fiftyone.core.stages.ViewStage` definitions.

| Copyright 2017-2021, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""
from collections import defaultdict
from copy import deepcopy
import re
import warnings

import bson

import eta.core.utils as etau

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
        self._prefix = None

    def __str__(self):
        return repr(self)

    def __repr__(self):
        return fou.pformat(self.to_mongo())

    def __hash__(self):
        # Must explicitly define this, since __eq__ is customized
        # https://docs.python.org/3.1/reference/datamodel.html#object.__hash__
        return super().__hash__()

    def __deepcopy__(self, memo):
        return self.__class__(deepcopy(self._expr, memo))

    def _freeze_prefix(self, prefix):
        _do_freeze_prefix(self, prefix)

    def to_mongo(self, prefix=None):
        """Returns a MongoDB representation of the expression.

        Args:
            prefix (None): an optional prefix to prepend to all
                :class:`ViewField` instances in the expression

        Returns:
            a MongoDB expression
        """
        if self._prefix:
            prefix = self._prefix

        return _do_to_mongo(self._expr, prefix)

    # Comparison operators ####################################################

    def __eq__(self, other):
        """Creates an expression that returns a boolean indicating whether
        ``self == other``.

        Args:
            other: a :class:`ViewExpression` or a python primitive understood
                by MongoDB

        Returns:
            a :class:`ViewExpression`
        """
        if other is None:
            return ~self.exists()

        return ViewExpression({"$eq": [self, other]})

    def __ge__(self, other):
        """Creates an expression that returns a boolean indicating whether
        ``self >= other``.

        Args:
            other: a :class:`ViewExpression` or a python primitive understood
                by MongoDB

        Returns:
            a :class:`ViewExpression`
        """
        return ViewExpression({"$gte": [self, other]})

    def __gt__(self, other):
        """Creates an expression that returns a boolean indicating whether
        ``self > other``.

        Args:
            other: a :class:`ViewExpression` or a python primitive understood
                by MongoDB

        Returns:
            a :class:`ViewExpression`
        """
        return ViewExpression({"$gt": [self, other]})

    def __le__(self, other):
        """Creates an expression that returns a boolean indicating whether
        ``self <= other``.

        Args:
            other: a :class:`ViewExpression` or a python primitive understood
                by MongoDB

        Returns:
            a :class:`ViewExpression`
        """
        return ViewExpression({"$lte": [self, other]})

    def __lt__(self, other):
        """Creates an expression that returns a boolean indicating whether
        ``self < other``.

        Args:
            other: a :class:`ViewExpression` or a python primitive understood
                by MongoDB

        Returns:
            a :class:`ViewExpression`
        """
        return ViewExpression({"$lt": [self, other]})

    def __ne__(self, other):
        """Creates an expression that returns a boolean indicating whether
        ``self != other``.

        Args:
            other: a :class:`ViewExpression` or a python primitive understood
                by MongoDB

        Returns:
            a :class:`ViewExpression`
        """
        if other is None:
            return self.exists()

        return ViewExpression({"$ne": [self, other]})

    def exists(self):
        """Creates an expression that returns a boolean indicating whether the
        expression, which must resolve to a field, exists and is not None.

        Returns:
            a :class:`ViewExpression`
        """
        # https://stackoverflow.com/a/25515046
        return ViewExpression({"$gt": [self, None]})

    # Logical operators #######################################################

    def __and__(self, other):
        """Creates an expression that returns a boolean that is the logical
        AND ``self & other``.

        Args:
            other: a :class:`ViewField` or :class:`ViewExpression`

        Returns:
            a :class:`ViewExpression`
        """
        return ViewExpression({"$and": [self, other]})

    def __invert__(self):
        """Creates an expression that returns a boolean that is the logical
        inversion ``~self``.

        Returns:
            a :class:`ViewExpression`
        """
        return ViewExpression({"$not": self})

    def __or__(self, other):
        """Creates an expression that returns a boolean that is the logical OR
        ``self | other``.

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

    # Numeric expression operators ############################################

    def __abs__(self):
        """Computes the absolute value of this numeric expression.

        Returns:
            a :class:`ViewExpression`
        """
        return self.abs()

    def __add__(self, other):
        """Adds the given value to this numeric expression, ``self + other``.

        Args:
            other: a number or :class:`ViewExpression`

        Returns:
            a :class:`ViewExpression`
        """
        return ViewExpression({"$add": [self, other]})

    def __ceil__(self):
        """Computes the ceiling of this numeric expression.

        Returns:
            a :class:`ViewExpression`
        """
        return self.ceil()

    def __floor__(self):
        """Computes the floor of this numeric expression.

        Returns:
            a :class:`ViewExpression`
        """
        return self.floor()

    def __round__(self, place=0):
        """Rounds this numeric expression at the given decimal place.

        Positive values of ``place`` will round to ``place`` decimal
        places::

            place=2: 1234.5678 --> 1234.57

        Negative values of ``place`` will round digits left of the decimal::

            place=-2: 1234.5678 --> 1200

        Args:
            place (0): the decimal place at which to round. Must be an
                integer in range ``(-20, 100)``

        Returns:
            a :class:`ViewExpression`
        """
        return self.round(place=place)

    def __mod__(self, other):
        """Computes the modulus of this numeric expression, ``self % other``.

        Args:
            other: a number or :class:`ViewExpression`

        Returns:
            a :class:`ViewExpression`
        """
        return ViewExpression({"$mod": [self, other]})

    def __mul__(self, other):
        """Computes the product of the given value and this numeric expression,
        ``self * other``.

        Args:
            other: a number or :class:`ViewExpression`

        Returns:
            a :class:`ViewExpression`
        """
        return ViewExpression({"$multiply": [self, other]})

    # pylint: disable=unused-argument
    def __pow__(self, power, modulo=None):
        """Raises this numeric expression to the given power,
        ``self ** power``.

        Args:
            power: the power

        Returns:
            a :class:`ViewExpression`
        """
        if modulo is not None:
            warnings.warn("Ignoring unsupported `modulo` argument")

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
        """Subtracts the given value from this numeric expression,
        ``self - other``.

        Args:
            other: a number or :class:`ViewExpression`

        Returns:
            a :class:`ViewExpression`
        """
        return ViewExpression({"$subtract": [self, other]})

    def __truediv__(self, other):
        """Divides this numeric expression by the given value,
        ``self / other``.

        Args:
            other: a number or :class:`ViewExpression`

        Returns:
            a :class:`ViewExpression`
        """
        return ViewExpression({"$divide": [self, other]})

    def abs(self):
        """Computes the absolute value of the numeric expression.

        Returns:
            a :class:`ViewExpression`
        """
        return ViewExpression({"$abs": self})

    def floor(self):
        """Computes the floor of this numeric expression.

        Returns:
            a :class:`ViewExpression`
        """
        return ViewExpression({"$floor": self})

    def ceil(self):
        """Computes the ceiling of this numeric expression.

        Returns:
            a :class:`ViewExpression`
        """
        return ViewExpression({"$ceil": self})

    def round(self, place=0):
        """Rounds this numeric expression at the given decimal place.

        Positive values of ``place`` will round to ``place`` decimal
        places::

            place=2: 1234.5678 --> 1234.57

        Negative values of ``place`` will round ``place`` digits left of the
        decimal::

            place=-1: 1234.5678 --> 1230

        Args:
            place (0): the decimal place at which to round. Must be an
                integer in range ``(-20, 100)``

        Returns:
            a :class:`ViewExpression`
        """
        return ViewExpression({"$round": [self, place]})

    def trunc(self, place=0):
        """Truncates this numeric expression at the specified decimal place.

        Positive values of ``place`` will truncate to ``place`` decimal
        places::

            place=2: 1234.5678 --> 1234.56

        Negative values of ``place`` will replace ``place`` digits left of the
        decimal with zero::

            place=-1: 1234.5678 --> 1230

        Args:
            place (0): the decimal place at which to truncate. Must be an
                integer in range ``(-20, 100)``

        Returns:
            a :class:`ViewExpression`
        """
        return ViewExpression({"$trunc": [self, place]})

    def exp(self):
        """Raises Euler's number to this numeric expression.

        Returns:
            a :class:`ViewExpression`
        """
        return ViewExpression({"$exp": self})

    def ln(self):
        """Computes the natural logarithm of this numeric expression.

        Returns:
            a :class:`ViewExpression`
        """
        return ViewExpression({"$ln": self})

    def log(self, base):
        """Computes logarithm base ``base`` of this numeric expression.

        Args:
            base: the logarithm base

        Returns:
            a :class:`ViewExpression`
        """
        return ViewExpression({"$log": [self, base]})

    def log10(self):
        """Computes logarithm base 10 of this numeric expression.

        Returns:
            a :class:`ViewExpression`
        """
        return ViewExpression({"$log10": self})

    def sqrt(self):
        """Computes the square root of this numeric expression.

        Returns:
            a :class:`ViewExpression`
        """
        return ViewExpression({"$sqrt": self})

    # Field operators #########################################################

    def type(self):
        """Returns the type string of this expression.

        See https://docs.mongodb.com/manual/reference/operator/aggregation/type
        for more details.

        Returns:
             a :class:`ViewExpression`
        """
        return ViewExpression({"$type": self})

    def is_null(self):
        """Determines whether this expression is null.

        Returns:
            :class:`ViewExpression`
        """
        return self == None

    def is_number(self):
        """Determines whether this expression is a number.

        Returns:
            :class:`ViewExpression`
        """
        return ViewExpression({"$isNumber": self})

    def is_string(self):
        """Determines whether this expression is a string.

        Returns:
            :class:`ViewExpression`
        """
        return self.type() == "string"

    def is_array(self):
        """Determines whether this expression is an array.

        Returns:
            :class:`ViewExpression`
        """
        return ViewExpression({"$isArray": self})

    def is_missing(self):
        """Determines whether this expression refers to a missing field.

        Returns:
            :class:`ViewExpression`
        """
        return self.type() == "missing"

    def is_in(self, values):
        """Creates an expression that returns a boolean indicating whether
        ``self in values``.

        Args:
            values: a value or iterable of values

        Returns:
            a :class:`ViewExpression`
        """
        if etau.is_str(values):
            values = [values]

        return ViewExpression({"$in": [self, list(values)]})

    def apply(self, expr):
        """Applies the given expression to this expression.

        Examples::

            from fiftyone import ViewField as F

            # Show samples whose first detection in the `predictions` field
            # has confidence > 0.95
            view = dataset.match(
                F("predictions.detections")[0].apply(F("confidence") > 0.95)
            )

        Args:
            expr: a :class:`ViewExpression`

        Returns:
            a :class:`ViewExpression`
        """
        expr._freeze_prefix("$$expr")
        return ViewExpression({"$let": {"vars": {"expr": self}, "in": expr}})

    def cases(self, mapping, default=None):
        """Applies a case statement to this expression, which effectively
        computes the following pseudocode::

            for key, value in mapping.items():
                if self == key:
                    return value

            if default is not None:
                return default

        Args:
            mapping: a dict mapping literals or :class:`ViewExpression` keys to
                literal or :class:`ViewExpression` values
            default (None): an optional literal or :class:`ViewExpression` to
                return if none of the switch branches are taken

        Returns:
            a :class:`ViewExpression`
        """
        mapping = {root_field == k: v for k, v in mapping.items()}
        return self.switch(mapping, default=default)

    def switch(self, mapping, default=None):
        """Applies a switch statement to this expression, which effectively
        computes the given pseudocode::

            for key, value in mapping.items():
                if self.apply(key):
                    return value

            if default is not None:
                return default

        Args:
            mapping: a dict mapping boolean :class:`ViewExpression` keys to
                literal or :class:`ViewExpression` values
            default (None): an optional literal or :class:`ViewExpression` to
                return if none of the switch branches are taken

        Returns:
            a :class:`ViewExpression`
        """
        branches = []
        for key, value in mapping.items():
            key._freeze_prefix("$$expr")
            branches.append({"case": key, "then": value})

        switch = {"branches": branches}
        if default is not None:
            switch["default"] = default

        return ViewExpression(
            {"$let": {"vars": {"expr": self}, "in": {"$switch": switch}}}
        )

    def map_values(self, mapping):
        """Replaces this expression with the corresponding value in the
        provided mapping dict, if it is present as a key.

        Examples::

            from fiftyone import ViewField as F

            # Replace "cat" and "dog" labels with "other" in a `predictions`
            # field, which is assumed to be a `Classification` field
            view = dataset.map_values(
                "predictions.label",
                F().map_values({"cat": "other", "dog": "other"},
            )

        Args:
            mapping: a dict mapping keys to replacement values

        Returns:
            a :class:`ViewExpression`
        """
        keys, values = zip(*list(mapping.items()))
        return ViewExpression(
            {
                "$let": {
                    "vars": {"this": self, "keys": keys, "values": values},
                    "in": {
                        "$cond": [
                            {"$in": ["$$this", "$$keys"]},
                            {
                                "$arrayElemAt": [
                                    "$$values",
                                    {"$indexOfArray": ["$$keys", "$$this"]},
                                ],
                            },
                            "$$this",
                        ]
                    },
                }
            }
        )

    def set_field(self, field, value_or_expr, root=False):
        """Sets the specified field of this expression, which must evaluate
        to a document, to the given value or expression.

        If ``value_or_expr`` is an expression and ``root == False``, it is
        applied to this expression via ``self.apply(value_or_expr)``.

        Examples::

            from fiftyone import ViewField as F

            #
            # Replaces the values of the `label` attritube of the `predictions`
            # field, which is assumed to be a `Classification` field, according
            # to the following rule:
            #
            #   If the `label` starts with `b`, replace it with `b`. Otherwise,
            #   replace it with "other"
            #
            view = dataset.map_values(
                "predictions",
                F().set_field(
                    "label",
                    F("label").re_match("^b").if_else("b", "other"),
                )
            )

        Args:
            field: the name of the field to set
            value_or_expr: a :class:`ViewExpression`
            root (False): whether ``value_or_expr`` should be treated as an
                expression with respect to the root document rather than being
                applied to this expression

        Returns:
            a :class:`ViewExpression`
        """
        if isinstance(value_or_expr, ViewExpression) and not root:
            value = self.apply(value_or_expr)
        else:
            value = value_or_expr

        expr = ViewExpression({"$mergeObjects": [self, {field: value}]})
        return self.let_in(expr)

    def let_in(self, expr):
        """Returns an equivalent expression where this expression is defined as
        a variable that is used wherever necessary in the given expression.

        This method is useful when ``expr`` contains multiple instances of this
        expression, since it avoids duplicate computation of this expression in
        the final pipeline.

        If ``expr`` is a simple expression such as a :class:`ViewField`, no
        variable is defined and ``expr`` is directly returned.

        Args:
            expr: a :class:`ViewExpression`

        Returns:
            a :class:`ViewExpression
        """
        if isinstance(self, (ViewField, ObjectId)):
            return expr

        self_expr = ViewField()
        self_expr._freeze_prefix("$$expr")

        in_expr = _do_apply_memo(expr, self, self_expr)

        return ViewExpression(
            {"$let": {"vars": {"expr": self}, "in": in_expr}}
        )

    # Array expression operators ##############################################

    def __getitem__(self, idx_or_slice):
        """Returns the element or slice of this array expression.

        All of the typical slicing operations are supported, except for
        specifying a non-unit step.

        Examples::

            expr[3]      # the fourth element
            expr[-1]     # the last element
            expr[:10]    # the first (up to) 10 elements
            expr[-3:]    # the last (up to) 3 elements
            expr[3:10]   # the fourth through tenth elements

        Args:
            idx_or_slice: the index or slice

        Returns:
            a :class:`ViewExpression`
        """
        if not isinstance(idx_or_slice, slice):
            return ViewExpression({"$arrayElemAt": [self, idx_or_slice]})

        s = idx_or_slice

        if s.step is not None and s.step != 1:
            raise ValueError(
                "Unsupported slice '%s'; step is not supported" % s
            )

        if s.start is not None:
            if s.stop is None:
                n = s.start
                return ViewExpression({"$slice": [self, n]})

            position = s.start
            n = s.stop - position
            if n < 0:
                return ViewExpression({"$literal": []})

            if position < 0:
                position += self.length()
                expr = ViewExpression({"$slice": [self, position, n]})
                return self.let_in(expr)

            return ViewExpression({"$slice": [self, position, n]})

        if s.stop is None:
            return self

        if s.stop < 0:
            n = self.length() + s.stop
            expr = ViewExpression({"$slice": [self, n]})
            return self.let_in(expr)

        n = s.stop
        return ViewExpression({"$slice": [self, n]})

    def __len__(self):
        # Annoyingly, Python enforces deep in its depths that __len__ must
        # return an int. So, we cannot return our length expression here...
        raise TypeError(
            "Computing the length of an expression via `len()` is not "
            "allowed; use `expression.length()` instead"
        )

    def length(self):
        """Computes the length of this array expression.

        If this expression's value is null or missing, zero is returned.

        Returns:
            a :class:`ViewExpression`
        """
        return ViewExpression({"$size": {"$ifNull": [self, []]}})

    def contains(self, value):
        """Checks whether the given value is in this array expression.

        Args:
            value: a value

        Returns:
            a :class:`ViewExpression`
        """
        return ViewExpression({"$in": [value, self]})

    def reverse(self):
        """Reverses the order of the elements in the array expression.

        Returns:
            a :class:`ViewExpression`
        """
        return ViewExpression({"$reverseArray": self})

    def filter(self, expr):
        """Applies the given filter to the elements of this expression, which
        must resolve to an array.

        The output array will only contain elements of the input array for
        which ``expr`` returns ``True``.

        Args:
            expr: a :class:`ViewExpression` that returns a boolean

        Returns:
            a :class:`ViewExpression`
        """
        expr._freeze_prefix("$$this")
        return ViewExpression({"$filter": {"input": self, "cond": expr}})

    def map(self, expr):
        """Applies the given expression to the elements of this expression,
        which must resolve to an array.

        The output will be an array with the applied results.

        Args:
            expr: a :class:`ViewExpression`

        Returns:
            a :class:`ViewExpression`
        """
        expr._freeze_prefix("$$this")
        return ViewExpression(
            {"$map": {"input": self, "as": "this", "in": expr}}
        )

    def sum(self):
        """Returns the sum of the values in this expression, which must resolve
        to a numeric array.

        Missing, non-numeric, or ``None``-valued elements are ignored.

        Returns:
            a :class:`ViewExpression`
        """
        return ViewExpression({"$sum": self})

    def mean(self):
        """Returns the average value in this expression, which must resolve to
        a numeric array.

        Missing or ``None``-valued elements are ignored.

        Returns:
            a :class:`ViewExpression`
        """
        return ViewExpression({"$avg": self})

    # String expression operators #############################################

    def substr(self, start=None, end=None, count=None):
        """Extracts the specified substring from this string expression.

        Args:
            start (None): the starting index of the substring. If negative,
                specifies an offset from the end of the string
            end (None): the ending index of the substring. If negative,
                specifies an offset from the end of the string
            count (None): the substring length to extract. If ``None``, the
                rest of the string is returned

        Returns:
            a :class:`ViewExpression`
        """
        if start is None and end is None and count is None:
            return self

        if start is None:
            start = 0

        if start < 0 and end is not None and end < 0:
            count = end - start
            end = None

        if start < 0:
            start += self.strlen()

        if end is not None:
            if end < 0:
                end += self.strlen()

            count = end - start
        elif count is None:
            count = -1

        expr = ViewExpression({"$substrBytes": [self, start, count]})
        return self.let_in(expr)

    def strlen(self):
        """Computes the length of this string expression.

        If this expression's value is null or missing, zero is returned.

        Returns:
            a :class:`ViewExpression`
        """
        return ViewExpression({"$strLenBytes": {"$ifNull": [self, ""]}})

    def lower(self):
        """Converts the string expression to lowercase.

        Returns:
            a :class:`ViewExpression`
        """
        return ViewExpression({"$toLower": self})

    def upper(self):
        """Converts the string expression to uppercase.

        Returns:
            a :class:`ViewExpression`
        """
        return ViewExpression({"$toUpper": self})

    def concat(self, str_or_expr):
        """Concatenates the given string to this string expression.

        Args:
            str_or_expr: a string or :class:`ViewExpression`

        Returns:
            a :class:`ViewExpression`
        """
        return ViewExpression({"$concat": [self, str_or_expr]})

    def strip(self, chars=None):
        """Removes whitespace characters from the beginning and end of the
        string expression. Or, if ``chars`` is provided, remove those
        characters instead.

        Args:
            chars (None): an optional string or :class:`ViewExpression`
                resolving to a string expression specifying characters to
                remove

        Returns:
            a :class:`ViewExpression`
        """
        trim = {"input": self}
        if chars is not None:
            trim["chars"] = chars

        return ViewExpression({"$trim": trim})

    def lstrip(self, chars=None):
        """Removes whitespace characters from the beginning of the string
        expression. Or, if ``chars`` is provided, remove those characters
        instead.

        Args:
            chars (None): an optional string or :class:`ViewExpression`
                resolving to a string expression specifying characters to
                remove

        Returns:
            a :class:`ViewExpression`
        """
        ltrim = {"input": self}
        if chars is not None:
            ltrim["chars"] = chars

        return ViewExpression({"$ltrim": ltrim})

    def rstrip(self, chars=None):
        """Removes whitespace characters from the end of the string expression.
        Or, if ``chars`` is provided, remove those characters instead.

        Args:
            chars (None): an optional string or :class:`ViewExpression`
                resolving to a string expression specifying characters to
                remove

        Returns:
            a :class:`ViewExpression`
        """
        rtrim = {"input": self}
        if chars is not None:
            rtrim["chars"] = chars

        return ViewExpression({"$rtrim": rtrim})

    def replace(self, old, new):
        """Replaces all occurances of ``old`` with ``new`` in the string
        expression.

        Args:
            old: a string or :class:`ViewExpression` resolving to a string
                expression specifying the substring to replace
            new: a string or :class:`ViewExpression` resolving to a string
                expression specifying the replacement value

        Returns:
            a :class:`ViewExpression`
        """
        return ViewExpression(
            {"$replaceAll": {"input": self, "find": old, "replacement": new}}
        )

    def re_match(self, regex, options=None):
        """Performs a regular expression pattern match on this expression,
        which must resolve to a string.

        The output of the expression will be ``True`` if the pattern matches
        and ``False`` otherwise.

        Examples::

            # Match fields that end in ".jpg"
            expr.re_match("\\.jpg$")

            # Match PNG images in "/my/dir"
            expr.re_match("/my/dir/.*\\.png")

        Args:
            regex: the regular expression to apply. Must be a Perl Compatible
                Regular Expression (PCRE). See
                `this page <https://docs.mongodb.com/manual/reference/operator/aggregation/regexMatch/#regexmatch-regex>`__
                for  details
            options (None): an optional string of regex options to apply. See
                `this page <https://docs.mongodb.com/manual/reference/operator/aggregation/regexMatch/#regexmatch-options>`__
                for the available options

        Returns:
            a :class:`ViewExpression`
        """
        return ViewExpression(
            {
                "$regexMatch": {
                    "input": self,
                    "regex": regex,
                    "options": options,
                }
            }
        )

    def starts_with(self, str_or_strs, case_sensitive=True):
        """Determines whether this string expression starts with the given
        string (or any of a list of strings).

        Args:
            str_or_strs: a string or iterable of strings
            case_sensitive (True): whether to perform a case sensitive match

        Returns:
            a :class:`ViewExpression`
        """
        str_or_strs = _escape_regex_chars(str_or_strs)

        if etau.is_str(str_or_strs):
            regex = "^" + str_or_strs
        else:
            regex = "^(%s)" % ("|".join(str_or_strs))

        options = None if case_sensitive else "i"
        return self.re_match(regex, options=options)

    def ends_with(self, str_or_strs, case_sensitive=True):
        """Determines whether this string expression ends with the given string
        (or any of a list of strings).

        Args:
            str_or_strs: a string or iterable of strings
            case_sensitive (True): whether to perform a case sensitive match

        Returns:
            a :class:`ViewExpression`
        """
        str_or_strs = _escape_regex_chars(str_or_strs)

        if etau.is_str(str_or_strs):
            regex = str_or_strs + "$"
        else:
            regex = "(%s)$" % ("|".join(str_or_strs))

        options = None if case_sensitive else "i"
        return self.re_match(regex, options=options)

    def contains_str(self, str_or_strs, case_sensitive=True):
        """Determines whether this string expression contains the given string
        (or any of a list of strings).

        Args:
            str_or_strs: a string or iterable of strings
            case_sensitive (True): whether to perform a case sensitive match

        Returns:
            a :class:`ViewExpression`
        """
        str_or_strs = _escape_regex_chars(str_or_strs)

        if etau.is_str(str_or_strs):
            regex = str_or_strs
        else:
            regex = "(%s)" % ("|".join(str_or_strs))

        options = None if case_sensitive else "i"
        return self.re_match(regex, options=options)

    def matches_str(self, str_or_strs, case_sensitive=True):
        """Determines whether this string expression exactly matches the given
        string (or any of a list of strings).

        Args:
            str_or_strs: a string or iterable of strings
            case_sensitive (True): whether to perform a case sensitive match

        Returns:
            a :class:`ViewExpression`
        """
        str_or_strs = _escape_regex_chars(str_or_strs)

        if etau.is_str(str_or_strs):
            regex = "^" + str_or_strs + "$"
        else:
            regex = "^(%s)$" % ("|".join(str_or_strs))

        options = None if case_sensitive else "i"
        return self.re_match(regex, options=options)

    # Hybrid expression operators #############################################

    def min(self, value=None):
        """Returns the minimum value of either this array expression, or the
        minimum of this expression and the given value.

        Missing or ``None`` values are ignored.

        Args:
            value (None): an optional value to compare to

        Returns:
            a :class:`ViewExpression`
        """
        if value is not None:
            return ViewExpression({"$min": [self, value]})

        return ViewExpression({"$min": self})

    def max(self, value=None):
        """Returns the maximum value of either this array expression, or the
        maximum of this expression and the given value.

        Missing or ``None`` values are ignored.

        Args:
            value (None): an optional value to compare to

        Returns:
            a :class:`ViewExpression`
        """
        if value is not None:
            return ViewExpression({"$max": [self, value]})

        return ViewExpression({"$max": self})

    # Conditional operators ###################################################

    def if_else(self, true_expr, false_expr):
        """Returns either ``true_expr`` or ``false_expr`` depending on the
        value of this expression, which must resolve to a boolean.

        Args:
            true_expr: a :class:`ViewExpression` or MongoDB expression dict
            false_expr: a :class:`ViewExpression` or MongoDB expression dict

        Returns:
            a :class:`ViewExpression`
        """
        return ViewExpression(
            {"$cond": {"if": self, "then": true_expr, "else": false_expr}}
        )


def _do_recurse(val, fcn):
    if isinstance(val, ViewExpression):
        return fcn(val)

    if isinstance(val, dict):
        return {
            _do_recurse(k, fcn): _do_recurse(v, fcn) for k, v in val.items()
        }

    if isinstance(val, list):
        return [_do_recurse(v, fcn) for v in val]

    return val


def _do_to_mongo(val, prefix):
    def fcn(val):
        return val.to_mongo(prefix=prefix)

    return _do_recurse(val, fcn)


def _do_freeze_prefix(val, prefix):
    def fcn(val):
        val._prefix = prefix

    return _do_recurse(val, fcn)


def _do_apply_memo(val, old, new):
    def fcn(val):
        if val is old:
            return new

        val._expr = _do_apply_memo(val._expr, old, new)
        return val

    return _do_recurse(val, fcn)


class _MetaViewField(type):

    # pylint: disable=no-member
    def __getattr__(cls, name):
        # This is here to prevent Sphinx from getting confused...
        # https://github.com/sphinx-doc/sphinx/issues/6859
        if not etau.is_str(name) or name.startswith("_"):
            return super().__getattr__(name)

        return ViewField(name)


class ViewField(ViewExpression, metaclass=_MetaViewField):
    """A field (or subfield) of an object in a
    :class:`fiftyone.core.stages.ViewStage`.

    A :class:`ViewField` can be created either via class attribute or object
    constructor syntax.

    You can use `dot notation <https://docs.mongodb.com/manual/core/document/#dot-notation>`_
    to refer to subfields of embedded objects within fields.

    Examples::

        from fiftyone import ViewField as F

        # Reference a field named `ground_truth`
        F("ground_truth")
        F.ground_truth           # equivalent

        # Reference the `label` field of the `ground_truth` object
        F("ground_truth.label")
        F("ground_truth").label  # equivalent
        F.ground_truth.label     # equivalent

        # Reference the root object
        F()

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
        name (None): the name of the field
    """

    def __init__(self, name=None):
        if name is not None and not etau.is_str(name):
            raise TypeError("`name` must be str; found %s" % name)

        super().__init__(name)

    def __getattr__(self, name):
        sub_name = self._expr + "." + name if self._expr else name
        return ViewField(sub_name)

    @property
    def name(self):
        """The name of the field."""
        return self._expr

    def to_mongo(self, prefix=None):
        """Returns a MongoDB representation of the field.

        Args:
            prefix (None): an optional prefix to prepend to the field name

        Returns:
            a string
        """
        if self._prefix:
            prefix = self._prefix

        if prefix:
            return prefix + "." + self._expr if self._expr else prefix

        return "$" + self._expr if self._expr else "$this"


#: A singleton representing the root of a document/field.
root_field = ViewField()


class ObjectId(ViewExpression, metaclass=_MetaViewField):
    """A :class:`ViewExpression` that refers to an
    `ObjectId <https://docs.mongodb.com/manual/reference/method/ObjectId>`_ of
    a document.

    The typical use case for this class is writing an expression that involves
    checking if the ID of a document matches a particular known ID.

    Example::

        from fiftyone import ViewField as F
        from fiftyone.core.expressions import ObjectId

        # Check if the ID of the document matches the given ID
        expr = F("_id") == ObjectId("5f452489ef00e6374aad384a")

    Args:
        oid: the object ID string
    """

    def __init__(self, oid):
        _ = bson.ObjectId(oid)  # validates that `oid` is valid value
        super().__init__(oid)

    def to_mongo(self, prefix=None):
        """Returns a MongoDB representation of the ObjectId.

        Args:
            prefix (None): unused

        Returns:
            a MongoDB expression
        """
        return {"$toObjectId": self._expr}


def _escape_regex_chars(str_or_strs):
    # Must escape `[`, `]`, `-`, and `\` because they have special meaning
    # inside the `[]` that will be used in the replacement regex
    regex_chars = r"\[\]{}()*+\-?.,\\^$|#"
    _escape = lambda s: re.sub(r"([%s])" % regex_chars, r"\\\1", s)

    if etau.is_str(str_or_strs):
        return _escape(str_or_strs)

    return [_escape(s) for s in str_or_strs]
