"""
A catalog of view expression operators, and the kinds they accept.

| Copyright 2017-2026, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|

An App building an expression needs to answer two questions as the user types:
which operators make sense for what they have so far, and which fields make
sense as the next operand. Both are type questions, and neither can be answered
from operator names alone.

This module supplies the type information. :class:`Kind` is a deliberately small
lattice — small enough that every operator can be placed in it, coarse enough
that it does not have to track MongoDB's type system. :func:`kind_of_field` maps
a dataset field onto that lattice, and :func:`build_catalog` pairs every
operator on :class:`fiftyone.core.expressions.ViewExpression` with the kinds it
accepts and returns.

Pairing the two is what makes typed suggestions possible: ``F("int") + `` knows
its left operand is a number, knows ``+`` wants a number on the right, and can
therefore offer only numeric fields. The same pairing drives validation, since
an operand whose kind cannot meet the operator's is an error worth reporting
before the view is applied.

Operators whose kinds are not yet declared are reported as :attr:`Kind.ANY`,
which accepts anything. Suggestions for those are unfiltered — the same
behavior as having no catalog at all — so coverage can grow without the
absence of an entry being mistaken for a claim.
"""

from enum import Enum
import inspect
from typing import Dict, List, Optional, Tuple, TypedDict

import fiftyone.core.fields as fof


class Kind(str, Enum):
    """The kind of value an operator accepts or produces.

    Coarser than MongoDB's type system on purpose: it exists to filter
    suggestions and catch operand mistakes, not to model the database.
    """

    ANY = "any"
    NUMBER = "number"
    STRING = "string"
    BOOLEAN = "boolean"
    ARRAY = "array"
    OBJECT = "object"
    DATE = "date"
    ID = "id"


# Resolved against the field's class hierarchy rather than its name, so the
# subclasses (FrameNumberField, ColorField, EmbeddedDocumentListField, ...)
# land on the right kind without being enumerated. Order matters: the first
# matching base wins, so narrower bases come first.
_FIELD_KINDS: Tuple[Tuple[type, Kind], ...] = (
    (fof.ObjectIdField, Kind.ID),
    (fof.BooleanField, Kind.BOOLEAN),
    (fof.IntField, Kind.NUMBER),
    (fof.FloatField, Kind.NUMBER),
    (fof.StringField, Kind.STRING),
    (fof.DateField, Kind.DATE),
    (fof.DateTimeField, Kind.DATE),
    (fof.ListField, Kind.ARRAY),
    (fof.VectorField, Kind.ARRAY),
    (fof.ArrayField, Kind.ARRAY),
    (fof.FrameSupportField, Kind.ARRAY),
    (fof.DictField, Kind.OBJECT),
    (fof.EmbeddedDocumentField, Kind.OBJECT),
)


def kind_of_field(field) -> Kind:
    """Returns the :class:`Kind` of a dataset field.

    Args:
        field: a :class:`fiftyone.core.fields.Field`, or a field class

    Returns:
        the field's kind, or :attr:`Kind.ANY` if it has no mapping
    """
    cls = field if inspect.isclass(field) else type(field)
    for base, kind in _FIELD_KINDS:
        if issubclass(cls, base):
            return kind

    return Kind.ANY


def field_kinds_by_ftype() -> Dict[str, Kind]:
    """Returns the kind of every field type, keyed by full class path.

    The App receives a field's type as this path (``ftype`` on the schema), so
    serving the mapping keeps the lattice defined in one place instead of being
    reimplemented client-side.
    """
    kinds = {}
    for name, obj in vars(fof).items():
        if (
            not inspect.isclass(obj)
            or not issubclass(obj, fof.Field)
            or name.startswith("_")
        ):
            continue

        kinds["%s.%s" % (fof.__name__, name)] = kind_of_field(obj)

    return kinds


# How an operator is written, which the App needs in order to render a
# suggestion and to insert it as the right kind of node.
_INFIX_FORM = "infix"
_PREFIX_FORM = "prefix"
_METHOD_FORM = "method"
_STATIC_FORM = "static"
_INDEX_FORM = "index"
_CALL_FORM = "call"
_BUILTIN_FORM = "builtin"

_A = Kind.ANY
_N = Kind.NUMBER
_S = Kind.STRING
_B = Kind.BOOLEAN
_L = Kind.ARRAY
_O = Kind.OBJECT
_D = Kind.DATE

# operator -> (kind of the receiver, kinds of the arguments, kind returned).
# Argument kinds cover the positional arguments an operator takes; operators
# absent from this table report ANY throughout.
_KINDS: Dict[str, Tuple[Kind, Tuple[Kind, ...], Kind]] = {
    # comparisons accept anything and answer a boolean
    "__eq__": (_A, (_A,), _B),
    "__ne__": (_A, (_A,), _B),
    "__lt__": (_A, (_A,), _B),
    "__le__": (_A, (_A,), _B),
    "__gt__": (_A, (_A,), _B),
    "__ge__": (_A, (_A,), _B),
    # boolean algebra
    "__and__": (_B, (_B,), _B),
    "__or__": (_B, (_B,), _B),
    "__rand__": (_B, (_B,), _B),
    "__ror__": (_B, (_B,), _B),
    "__invert__": (_B, (), _B),
    # arithmetic
    "__add__": (_N, (_N,), _N),
    "__sub__": (_N, (_N,), _N),
    "__mul__": (_N, (_N,), _N),
    "__truediv__": (_N, (_N,), _N),
    "__mod__": (_N, (_N,), _N),
    "__pow__": (_N, (_N,), _N),
    "__radd__": (_N, (_N,), _N),
    "__rsub__": (_N, (_N,), _N),
    "__rmul__": (_N, (_N,), _N),
    "__rtruediv__": (_N, (_N,), _N),
    "__rmod__": (_N, (_N,), _N),
    "__abs__": (_N, (), _N),
    "__ceil__": (_N, (), _N),
    "__floor__": (_N, (), _N),
    "__round__": (_N, (), _N),
    "abs": (_N, (), _N),
    "ceil": (_N, (), _N),
    "floor": (_N, (), _N),
    "round": (_N, (_N,), _N),
    "trunc": (_N, (_N,), _N),
    "exp": (_N, (), _N),
    "ln": (_N, (), _N),
    "log": (_N, (_N,), _N),
    "log10": (_N, (), _N),
    "sqrt": (_N, (), _N),
    "pow": (_N, (_N,), _N),
    "rand": (_A, (), _N),
    "randn": (_A, (), _N),
    # trigonometry
    "sin": (_N, (), _N),
    "cos": (_N, (), _N),
    "tan": (_N, (), _N),
    "sinh": (_N, (), _N),
    "cosh": (_N, (), _N),
    "tanh": (_N, (), _N),
    "arcsin": (_N, (), _N),
    "arccos": (_N, (), _N),
    "arctan": (_N, (), _N),
    "arcsinh": (_N, (), _N),
    "arccosh": (_N, (), _N),
    "arctanh": (_N, (), _N),
    # strings
    "lower": (_S, (), _S),
    "upper": (_S, (), _S),
    "lstrip": (_S, (_S,), _S),
    "rstrip": (_S, (_S,), _S),
    "strip": (_S, (_S,), _S),
    "replace": (_S, (_S, _S), _S),
    "substr": (_S, (), _S),
    "strlen": (_S, (), _N),
    "split": (_S, (_S,), _L),
    "rsplit": (_S, (_S,), _L),
    "starts_with": (_S, (_S,), _B),
    "ends_with": (_S, (_S,), _B),
    "contains_str": (_S, (_S,), _B),
    "matches_str": (_S, (_S,), _B),
    "re_match": (_S, (_S,), _B),
    "join": (_L, (_S,), _S),
    "concat": (_S, (_S,), _S),
    # casts
    "to_bool": (_A, (), _B),
    "to_int": (_A, (), _N),
    "to_double": (_A, (), _N),
    "to_string": (_A, (), _S),
    "to_date": (_A, (), _D),
    # presence and type predicates
    "exists": (_A, (), _B),
    "is_null": (_A, (), _B),
    "is_missing": (_A, (), _B),
    "is_string": (_A, (), _B),
    "is_number": (_A, (), _B),
    "is_array": (_A, (), _B),
    "is_in": (_A, (_L,), _B),
    "type": (_A, (), _S),
    # dates
    "year": (_D, (), _N),
    "month": (_D, (), _N),
    "week": (_D, (), _N),
    "day_of_month": (_D, (), _N),
    "day_of_week": (_D, (), _N),
    "day_of_year": (_D, (), _N),
    "hour": (_D, (), _N),
    "minute": (_D, (), _N),
    "second": (_D, (), _N),
    "millisecond": (_D, (), _N),
    # arrays
    "length": (_L, (), _N),
    "contains": (_L, (_A,), _B),
    "is_subset": (_L, (_L,), _B),
    "set_equals": (_L, (_L,), _B),
    "sum": (_L, (), _N),
    "mean": (_L, (), _N),
    "min": (_L, (), _N),
    "max": (_L, (), _N),
    "std": (_L, (), _N),
    "filter": (_L, (_B,), _L),
    "map": (_L, (_A,), _L),
    "sort": (_L, (), _L),
    "reverse": (_L, (), _L),
    "unique": (_L, (), _L),
    "union": (_L, (_L,), _L),
    "intersection": (_L, (_L,), _L),
    "difference": (_L, (_L,), _L),
    "append": (_L, (_A,), _L),
    "prepend": (_L, (_A,), _L),
    "extend": (_L, (_L,), _L),
    "insert": (_L, (_N, _A), _L),
    "enumerate": (_L, (), _L),
    "zip": (_L, (_L,), _L),
    "range": (_N, (_N,), _L),
    "reduce": (_L, (_A,), _A),
    "all": (_L, (), _B),
    "any": (_L, (), _B),
    # control flow and documents
    "if_else": (_B, (_A, _A), _A),
    "if_null": (_A, (_A,), _A),
    "set_field": (_O, (_S, _A), _O),
    "map_values": (_A, (_O,), _A),
    "literal": (_A, (_A,), _A),
}

# Operators the App should not offer: internal plumbing, or the tree/lowering
# API rather than expression building.
_EXCLUDED = frozenset(
    {
        "to_mongo",
        "to_ast",
        "from_ast",
        "to_python",
        "is_frozen",
        "is_reconstructible",
        "apply",
        "let_in",
    }
)

_SYNTAX_FORMS: Dict[str, str] = {
    "__eq__": _INFIX_FORM,
    "__ne__": _INFIX_FORM,
    "__lt__": _INFIX_FORM,
    "__le__": _INFIX_FORM,
    "__gt__": _INFIX_FORM,
    "__ge__": _INFIX_FORM,
    "__and__": _INFIX_FORM,
    "__or__": _INFIX_FORM,
    "__add__": _INFIX_FORM,
    "__sub__": _INFIX_FORM,
    "__mul__": _INFIX_FORM,
    "__truediv__": _INFIX_FORM,
    "__mod__": _INFIX_FORM,
    "__pow__": _INFIX_FORM,
    "__invert__": _PREFIX_FORM,
    "__getitem__": _INDEX_FORM,
    "__call__": _CALL_FORM,
    "__abs__": _BUILTIN_FORM,
    "__ceil__": _BUILTIN_FORM,
    "__floor__": _BUILTIN_FORM,
    "__round__": _BUILTIN_FORM,
    "__len__": _BUILTIN_FORM,
}

_DISPLAY: Dict[str, str] = {
    "__eq__": "==",
    "__ne__": "!=",
    "__lt__": "<",
    "__le__": "<=",
    "__gt__": ">",
    "__ge__": ">=",
    "__and__": "&",
    "__or__": "|",
    "__add__": "+",
    "__sub__": "-",
    "__mul__": "*",
    "__truediv__": "/",
    "__mod__": "%",
    "__pow__": "**",
    "__invert__": "~",
    "__abs__": "abs",
    "__ceil__": "math.ceil",
    "__floor__": "math.floor",
    "__round__": "round",
    "__len__": "len",
    "__getitem__": "[]",
    "__call__": "()",
}

# Reflected operators duplicate their forward counterpart in the App, so they
# are catalogued but marked, letting a client hide them from suggestions while
# still validating a tree that contains one.
_REFLECTED = frozenset(
    {
        "__radd__",
        "__rsub__",
        "__rmul__",
        "__rtruediv__",
        "__rmod__",
        "__rand__",
        "__ror__",
    }
)


# The dunders that are expression operators, derived from the syntax tables
# above so the two cannot disagree. Every other dunder on the class belongs to
# Python's object protocol (__init__, __hash__, __repr__, ...) and is not
# something the App can offer.
_OPERATOR_DUNDERS = set(_SYNTAX_FORMS) | _REFLECTED


class OperatorSpec(TypedDict):
    """One operator, with everything needed to suggest and validate it."""

    name: str
    display: str
    syntax: str
    self_kind: str
    arg_kinds: List[str]
    returns: str
    min_args: int
    max_args: Optional[int]
    reflected: bool
    typed: bool
    summary: str


def build_catalog() -> List[OperatorSpec]:
    """Builds the operator catalog.

    Arity and documentation come from introspecting
    :class:`fiftyone.core.expressions.ViewExpression`, so they cannot drift from
    the implementation. Kinds come from this module's table; an operator with no
    entry is reported as :attr:`Kind.ANY` with ``typed`` False.

    Returns:
        a list of :class:`OperatorSpec`, sorted by name
    """
    import fiftyone.core.expressions as foe

    specs: List[OperatorSpec] = []
    for name in dir(foe.ViewExpression):
        if name in _EXCLUDED:
            continue

        if name.startswith("__"):
            if name not in _OPERATOR_DUNDERS:
                continue
        elif name.startswith("_"):
            continue

        static = isinstance(
            inspect.getattr_static(foe.ViewExpression, name), staticmethod
        )
        attr = getattr(foe.ViewExpression, name)
        if not callable(attr):
            continue

        min_args, max_args = _arity(attr, static=static)
        self_kind, arg_kinds, returns = _KINDS.get(
            name, (Kind.ANY, (), Kind.ANY)
        )

        specs.append(
            OperatorSpec(
                name=name,
                display=_DISPLAY.get(name, name),
                syntax=_SYNTAX_FORMS.get(
                    name, _STATIC_FORM if static else _METHOD_FORM
                ),
                self_kind=self_kind.value,
                arg_kinds=[k.value for k in arg_kinds],
                returns=returns.value,
                min_args=min_args,
                max_args=max_args,
                reflected=name in _REFLECTED,
                typed=name in _KINDS,
                summary=_summary(attr),
            )
        )

    return sorted(specs, key=lambda s: s["name"])


def _arity(func, static: bool) -> Tuple[int, Optional[int]]:
    """Returns the ``(min, max)`` positional arity, excluding ``self``.

    ``max`` is None for operators taking ``*args``.
    """
    try:
        params = list(inspect.signature(func).parameters.values())
    except (TypeError, ValueError):
        return 0, None

    if not static and params and params[0].name == "self":
        params = params[1:]

    minimum = 0
    maximum = 0
    for param in params:
        if param.kind is inspect.Parameter.VAR_POSITIONAL:
            return minimum, None

        if param.kind is inspect.Parameter.VAR_KEYWORD:
            continue

        maximum += 1
        if param.default is inspect.Parameter.empty:
            minimum += 1

    return minimum, maximum


def _summary(func) -> str:
    """Returns the first line of an operator's docstring."""
    doc = inspect.getdoc(func)
    if not doc:
        return ""

    return doc.strip().split("\n", 1)[0]


def coverage() -> Tuple[int, int]:
    """Returns ``(typed, total)`` operator counts.

    Reported so that growth in kind coverage is measurable, and so a drop is
    visible rather than silently degrading suggestions to unfiltered.
    """
    catalog = build_catalog()
    return sum(1 for spec in catalog if spec["typed"]), len(catalog)
