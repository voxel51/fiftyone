"""
Expressions for :class:`fiftyone.core.stages.ViewStage` definitions.

| Copyright 2017-2020, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""
from copy import deepcopy
import re

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

    def to_mongo(self, prefix=None):
        """Returns a MongoDB representation of the expression.

        Args:
            prefix (None): an optional prefix to prepend to all
                :class:`ViewField` instances in the expression

        Returns:
            a MongoDB expression
        """
        return ViewExpression._recurse(self._expr, prefix)

    # Comparison expression operators #########################################

    def __eq__(self, other):
        """Creates an expression that returns a boolean indicating whether
        ``self == other``.

        Args:
            other: a :class:`ViewExpression` or a python primitive understood
                by MongoDB

        Returns:
            a :class:`ViewExpression`
        """
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
        return ViewExpression({"$ne": [self, other]})

    # Logical expression operators ############################################

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

    # Arithmetic expression operators #########################################

    def __abs__(self):
        """Creates an expression that returns a number that is the absolute
        value of this expression.

        Returns:
            a :class:`ViewExpression`
        """
        return ViewExpression({"$abs": self})

    def __add__(self, other):
        """Creates an expression that returns ``self + other``.

        Args:
            other: a :class:`ViewField`, :class:`ViewExpression` or numeric

        Returns:
            a :class:`ViewExpression`
        """
        return ViewExpression({"$add": [self, other]})

    def __ceil__(self):
        """Creates an expression that returns a number that is the ``CEIL``
        of this expression.

        Returns:
            a :class:`ViewExpression`
        """
        return ViewExpression({"$ceil": self})

    def __floor__(self):
        """Creates an expression that returns a number that is the ``FLOOR`` of
        this expression.

        Returns:
            a :class:`ViewExpression`
        """
        return ViewExpression({"$floor": self})

    def __round__(self, place=0):
        """Creates an expression that returns a number that is the rounded
        value of this expression.

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
        return ViewExpression({"$round": [self, place]})

    def __mod__(self, other):
        """Creates an expression that returns ``self % other``.

        Args:
            other: a :class:`ViewField`, :class:`ViewExpression` or numeric

        Returns:
            a :class:`ViewExpression`
        """
        return ViewExpression({"$mod": [self, other]})

    def __mul__(self, other):
        """Creates an expression that returns ``self * other``.

        Args:
            other: a :class:`ViewField`, :class:`ViewExpression` or numeric

        Returns:
            a :class:`ViewExpression`
        """
        return ViewExpression({"$multiply": [self, other]})

    # pylint: disable=unused-argument
    def __pow__(self, power, modulo=None):
        """Creates an expression that returns ``self ** power``.

        Args:
            power: the power that ``self`` is raised to
            modulo (None): unsupported argument

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
        """Creates an expression that returns ``self - other``.

        Args:
            other: a :class:`ViewField`, :class:`ViewExpression` or numeric

        Returns:
            a :class:`ViewExpression`
        """
        return ViewExpression({"$subtract": [self, other]})

    def __truediv__(self, other):
        """Creates an expression that returns ``self / other``.

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

        Positive values of ``place`` will truncate to ``place`` decimal
        places::

            place=2: 1234.5678 --> 1234.56

        Negative values of ``place`` replace digits left of the decimal with
        zero::

            place=-2: 1234.5678 --> 1200

        Args:
            place (0): the decimal place at which to truncate. Must be an
                integer in range ``(-20, 100)``

        Returns:
            a :class:`ViewExpression`
        """
        return ViewExpression({"$trunc": [self, place]})

    # Array expression operators ##############################################

    def __getitem__(self, idx_or_slice):
        """Returns the element or slice of the given expression, which must
        resolve to an array.

        All of the typical array slicing operations are supported, except for
        specifying a non-unit step.

        Examples::

            expr[3]      # the fourth element of the array
            expr[:10]    # the first (up to) 10 elements of the array
            expr[-3:]    # the last (up to) 3 elements of the array
            expr[3:10]   # the fourth through tenth elements of the array

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
            if position < 0:
                position += self.length()

            return ViewExpression({"$slice": [self, position, n]})

        if s.stop is None:
            return self

        if s.stop < 0:
            n = self.length() + s.stop
            return ViewExpression({"$slice": [self, n]})

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
        """Computes the length of the expression, which must resolve to an
        array.

        If the expression is null, 0 is returned.

        Returns:
            a :class:`ViewExpression`
        """
        return ViewExpression({"$size": {"$ifNull": [self, []]}})

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

    def contains(self, value):
        """Creates an expression that returns a boolean indicating whether
        ``value in self``.

        Args:
            value: the value to check if it is contained in ``self``

        Returns:
            a :class:`ViewExpression`
        """
        return ViewExpression({"$in": [value, self]})

    def filter(self, expr):
        """Applies the filter to the elements of the expression, which must
        resolve to an array.

        The output array will only contain elements of the input array for
        which ``expr`` returns ``True``.

        Args:
            expr: a :class:`ViewExpression` that returns a boolean

        Returns:
            a :class:`ViewExpression`
        """
        return ViewExpression(
            {
                "$filter": {
                    "input": self,
                    "cond": expr.to_mongo(prefix="$$this"),
                }
            }
        )

    # String expression operators #############################################

    def re_match(self, regex, options=None):
        """Performs a regular expression pattern match on the expression, which
        must resolve to a string.

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
        """Determines whether the string expression starts with the given
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
        """Determines whether the string expression ends with the given string
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
        """Determines whether the string expression contains the given string
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
        """Determines whether the string expression exactly matches the given
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

    # Private methods #########################################################

    @staticmethod
    def _recurse(val, prefix):
        if isinstance(val, ViewExpression):
            return val.to_mongo(prefix=prefix)

        if isinstance(val, dict):
            return {
                ViewExpression._recurse(k, prefix): ViewExpression._recurse(
                    v, prefix
                )
                for k, v in val.items()
            }

        if isinstance(val, list):
            return [ViewExpression._recurse(v, prefix) for v in val]

        return val


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
        if prefix:
            return prefix + "." + self._expr if self._expr else prefix

        return "$" + self._expr if self._expr else "$this"


def _escape_regex_chars(str_or_strs):
    # Must escape `[`, `]`, `-`, and `\` because they have special meaning
    # inside the `[]` that will be used in the replacement regex
    regex_chars = r"\[\]{}()*+\-?.,\\^$|#"
    _escape = lambda s: re.sub(r"([%s])" % regex_chars, r"\\\1", s)

    if etau.is_str(str_or_strs):
        return _escape(str_or_strs)

    return [_escape(s) for s in str_or_strs]
