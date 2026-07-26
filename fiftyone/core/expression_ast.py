"""
Serializable syntax trees for view expressions.

| Copyright 2017-2026, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|

:meth:`ViewExpression.to_mongo` lowers an expression to a MongoDB aggregation
expression, and that lowering is one-way: ``F("x") & F("y")`` and
``F("x").all([...])`` both produce ``{"$and": [...]}``, ``F("x").exists()``
produces the same shape as a comparison against ``null``, and 20 operators
lower into multi-node idioms (``length()`` becomes
``{"$size": {"$ifNull": ["$x", []]}}``). Nothing downstream of the lowering can
tell which operator the caller used.

This module records the construction itself, so an expression built in the App
can be reconstructed here as the same ``F(...)`` / ``E(...)`` calls, and one
built in Python can be rendered in the App as structure rather than as opaque
MongoDB. The lowering is unchanged and remains what the aggregation pipeline
consumes.

Node forms::

    {"t": "field",  "path": "conf"}                      a ViewField
    {"t": "lit",    "v": 0.5}                            a JSON literal
    {"t": "call",   "op": "__gt__", "self": <node>,
                    "args": [<node>], "kwargs": {}}      an instance method
    {"t": "static", "op": "any",
                    "args": [<node>], "kwargs": {}}      a static constructor
    {"t": "list",   "items": [<node>]}                   a list operand
    {"t": "dict",   "entries": [[<node>, <node>]]}       a dict operand
    {"t": "mongo",  "expr": {...}}                       raw MongoDB, no syntax

The ``mongo`` form is the fallback: expressions built by passing MongoDB
directly to ``E({...})``, and expressions arriving from a view saved before
this module existed, carry no construction to record. They round trip
losslessly as MongoDB, and callers can tell the difference by checking
:func:`is_reconstructible`.
"""

from datetime import date, datetime, timedelta
from functools import wraps
import inspect
from typing import (
    Any,
    Callable,
    Dict,
    List,
    Literal,
    Optional,
    Tuple,
    TYPE_CHECKING,
    TypedDict,
    Union,
)

import fiftyone.core.utils as fou

if TYPE_CHECKING:
    from fiftyone.core.expressions import ViewExpression, ViewField


JSONValue = Union[
    None, bool, int, float, str, List["JSONValue"], Dict[str, "JSONValue"]
]


class FieldNode(TypedDict):
    """A :class:`fiftyone.core.expressions.ViewField`."""

    t: Literal["field"]
    path: str


# A JSON literal. `as` marks values that are not JSON natively — dates and
# timedeltas are stored as milliseconds and rebuilt on decode. Declared
# functionally because `as` is a keyword and cannot be a field name.
LiteralNode = TypedDict(
    "LiteralNode",
    {
        "t": Literal["lit"],
        "v": JSONValue,
        "as": Literal["date", "timedelta"],
    },
    total=False,
)


class CallNode(TypedDict, total=False):
    """An instance method or operator applied to a target expression."""

    t: Literal["call"]
    op: str
    self: "Node"
    args: List["Node"]
    kwargs: Dict[str, "Node"]


class StaticNode(TypedDict, total=False):
    """A static constructor such as ``E.any`` or ``E.literal``."""

    t: Literal["static"]
    op: str
    args: List["Node"]
    kwargs: Dict[str, "Node"]


class ListNode(TypedDict):
    """A list operand, whose items may themselves be expressions."""

    t: Literal["list"]
    items: List["Node"]


class DictNode(TypedDict):
    """A dict operand, whose keys and values may themselves be expressions."""

    t: Literal["dict"]
    entries: List[List["Node"]]


class MongoNode(TypedDict):
    """Raw MongoDB, for an expression that recorded no syntax."""

    t: Literal["mongo"]
    expr: JSONValue


Node = Union[
    FieldNode, LiteralNode, CallNode, StaticNode, ListNode, DictNode, MongoNode
]

Envelope = Dict[str, Dict[str, Union[int, Node]]]


AST_VERSION = 1
"""Version of the syntax tree format.

Bump this when a node form changes meaning. Readers reject envelopes they don't
understand rather than guessing, and fall back to the MongoDB the envelope is
serialized alongside.
"""

AST_KEY = "_fo_expr"
"""Envelope key identifying a serialized expression.

Chosen so it cannot collide with a MongoDB operator (which are ``$``-prefixed),
which is what lets a decoder distinguish a persisted expression from a raw
aggregation expression without ambiguity.
"""

# Instance methods that build expressions are recorded automatically; these
# return something else, or would record themselves, so they are left alone.
_NOT_RECORDED = frozenset(
    {
        "to_mongo",
        "to_ast",
        "to_python",
        "from_ast",
        "is_frozen",
        "is_reconstructible",
        "__init__",
        "__new__",
        "__hash__",
        "__str__",
        "__repr__",
        "__deepcopy__",
        "__getstate__",
        "__setstate__",
        "__reduce__",
        "__reduce_ex__",
        "__class__",
        "__dir__",
        "__format__",
        "__sizeof__",
        "__init_subclass__",
        "__subclasshook__",
        "__getattribute__",
        "__setattr__",
        "__delattr__",
    }
)

# Dunder -> Python source syntax, for rendering a tree back as code. Operators
# absent here render as `.name(args)`.
_INFIX = {
    "__eq__": "==",
    "__ne__": "!=",
    "__gt__": ">",
    "__ge__": ">=",
    "__lt__": "<",
    "__le__": "<=",
    "__add__": "+",
    "__sub__": "-",
    "__mul__": "*",
    "__truediv__": "/",
    "__mod__": "%",
    "__pow__": "**",
    "__and__": "&",
    "__or__": "|",
}

# Reflected operators: same syntax, operands swapped.
_REFLECTED = {
    "__radd__": "+",
    "__rsub__": "-",
    "__rmul__": "*",
    "__rtruediv__": "/",
    "__rmod__": "%",
    "__rand__": "&",
    "__ror__": "|",
}

_PREFIX = {"__invert__": "~"}

_BUILTIN_CALL = {
    "__abs__": "abs",
    "__ceil__": "math.ceil",
    "__floor__": "math.floor",
    "__round__": "round",
    "__len__": "len",
}

# Python operator precedence, loosest first, for parenthesizing rendered
# source. Note that `&` and `|` bind TIGHTER than comparisons in Python, which
# is why `(F("x") > 1) & ...` needs its parentheses.
_PRECEDENCE = {
    "==": 1,
    "!=": 1,
    ">": 1,
    ">=": 1,
    "<": 1,
    "<=": 1,
    "|": 2,
    "&": 3,
    "+": 4,
    "-": 4,
    "*": 5,
    "/": 5,
    "%": 5,
    "**": 6,
}


def records_expression_syntax(cls: type) -> type:
    """Class decorator that records how each expression was constructed.

    Wraps every expression-building method on the class so that the returned
    expression carries the operator and operands that produced it. Applied to
    :class:`fiftyone.core.expressions.ViewExpression`, this covers all ~130
    operators without touching them individually.
    """
    for name, attr in list(vars(cls).items()):
        if name in _NOT_RECORDED:
            continue

        static = isinstance(inspect.getattr_static(cls, name), staticmethod)
        func = attr.__func__ if static else attr
        if not callable(func):
            continue

        wrapper = _record(func, name, static=static)
        setattr(cls, name, staticmethod(wrapper) if static else wrapper)

    return cls


def _record(func: Callable, op: str, static: bool) -> Callable:
    @wraps(func)
    def wrapper(*args, **kwargs):
        result = func(*args, **kwargs)

        # Only expression-building calls carry syntax; predicates and
        # lowering helpers return other types and are left untouched.
        if not _is_expression(result):
            return result

        if static:
            node = {
                "t": "static",
                "op": op,
                "args": [_encode(a) for a in args],
                "kwargs": {k: _encode(v) for k, v in kwargs.items()},
            }
        else:
            node = {
                "t": "call",
                "op": op,
                "self": _encode(args[0]),
                "args": [_encode(a) for a in args[1:]],
                "kwargs": {k: _encode(v) for k, v in kwargs.items()},
            }

        result._ast = node
        return result

    return wrapper


def _is_expression(value: Any) -> bool:
    import fiftyone.core.expressions as foe

    return isinstance(value, foe.ViewExpression)


def _encode(value: Any) -> Node:
    """Encodes an operand as a node."""
    import fiftyone.core.expressions as foe

    if isinstance(value, foe.ViewField):
        return _field_node(value)

    if isinstance(value, foe.ViewExpression):
        return node_of(value)

    if isinstance(value, (list, tuple)):
        return {"t": "list", "items": [_encode(v) for v in value]}

    if isinstance(value, dict):
        return {
            "t": "dict",
            "entries": [[_encode(k), _encode(v)] for k, v in value.items()],
        }

    if isinstance(value, (date, datetime)):
        return {
            "t": "lit",
            "v": fou.datetime_to_timestamp(value),
            "as": "date",
        }

    if isinstance(value, timedelta):
        return {"t": "lit", "v": fou.timedelta_to_ms(value), "as": "timedelta"}

    return {"t": "lit", "v": value}


def _field_node(field: "ViewField") -> FieldNode:
    """Encodes a :class:`fiftyone.core.expressions.ViewField`.

    ``F("$x")`` freezes the field and strips the ``$``, so the sigil is restored
    here to keep the rendered source faithful to what was written. A field
    frozen to a non-empty prefix by the stage machinery carries only its name;
    the prefix is part of the lowering, and ``to_mongo`` reapplies it.
    """
    path = field._expr or ""
    if field._prefix == "":
        path = "$" + path

    return {"t": "field", "path": path}


def node_of(expr: "ViewExpression") -> Node:
    """Returns the syntax tree node for an expression.

    Expressions built from raw MongoDB have no recorded syntax and yield a
    ``mongo`` node.
    """
    import fiftyone.core.expressions as foe

    node = getattr(expr, "_ast", None)
    if node is not None:
        return node

    if isinstance(expr, foe.ViewField):
        return _field_node(expr)

    return {"t": "mongo", "expr": expr.to_mongo()}


def is_reconstructible(expr: "ViewExpression") -> bool:
    """Whether an expression can be rendered as Python source.

    False for expressions built by handing MongoDB to ``E({...})``, and for
    anything containing such a subexpression.
    """
    return _is_reconstructible_node(node_of(expr))


def _is_reconstructible_node(node: Node) -> bool:
    t = node.get("t")
    if t == "mongo":
        return False

    if t == "field":
        return True

    if t == "lit":
        return "as" in node or _is_json_literal(node["v"])

    if t == "list":
        return all(_is_reconstructible_node(n) for n in node["items"])

    if t == "dict":
        return all(
            _is_reconstructible_node(k) and _is_reconstructible_node(v)
            for k, v in node["entries"]
        )

    children = list(node.get("args", []))
    children.extend(node.get("kwargs", {}).values())
    if "self" in node:
        children.append(node["self"])

    return all(_is_reconstructible_node(n) for n in children)


def _is_json_literal(value: Any) -> bool:
    """Whether a literal survives serialization.

    Operands that are neither expressions nor JSON — a ``slice`` handed to
    ``__getitem__``, say — are recorded verbatim by :func:`_encode`, and a tree
    containing one cannot be written to a saved view. Such a tree reports as not
    reconstructible so callers fall back to the MongoDB instead.
    """
    if value is None or isinstance(value, (bool, int, float, str)):
        return True

    if isinstance(value, (list, tuple)):
        return all(_is_json_literal(v) for v in value)

    if isinstance(value, dict):
        return all(
            isinstance(k, str) and _is_json_literal(v)
            for k, v in value.items()
        )

    return False


def to_envelope(expr: "ViewExpression") -> Envelope:
    """Serializes an expression as a versioned envelope."""
    return {AST_KEY: {"version": AST_VERSION, "node": node_of(expr)}}


def is_envelope(value: Any) -> bool:
    """Whether a serialized value is an expression envelope."""
    return isinstance(value, dict) and AST_KEY in value


def from_envelope(value: Envelope) -> "ViewExpression":
    """Reconstructs an expression from a versioned envelope.

    Raises:
        ValueError: if the envelope's version is not understood, so callers can
            fall back to the MongoDB representation rather than misread a tree
    """
    payload = value[AST_KEY]
    version = payload.get("version")
    if version != AST_VERSION:
        raise ValueError(
            "unsupported view expression syntax version %r (this build reads "
            "version %d)" % (version, AST_VERSION)
        )

    return from_node(payload["node"])


def from_node(node: Node) -> "ViewExpression":
    """Reconstructs an expression from a syntax tree node."""
    import fiftyone.core.expressions as foe

    value = _decode(node)
    if isinstance(value, foe.ViewExpression):
        return value

    return foe.ViewExpression(value)


def _decode(node: Node) -> Any:
    import fiftyone.core.expressions as foe

    t = node.get("t")

    if t == "field":
        return foe.ViewField(node["path"] or None)

    if t == "lit":
        return _decode_literal(node)

    if t == "list":
        return [_decode(n) for n in node["items"]]

    if t == "dict":
        return {_decode(k): _decode(v) for k, v in node["entries"]}

    if t == "mongo":
        return foe.ViewExpression(node["expr"])

    if t == "static":
        func = getattr(foe.ViewExpression, node["op"])
        return func(
            *[_decode(n) for n in node["args"]],
            **{k: _decode(v) for k, v in node.get("kwargs", {}).items()},
        )

    if t == "call":
        target = _decode(node["self"])
        method = getattr(target, node["op"])
        return method(
            *[_decode(n) for n in node["args"]],
            **{k: _decode(v) for k, v in node.get("kwargs", {}).items()},
        )

    raise ValueError("unknown view expression node type %r" % t)


def _decode_literal(node: LiteralNode) -> Any:
    as_ = node.get("as")
    if as_ == "date":
        return fou.timestamp_to_datetime(node["v"])

    if as_ == "timedelta":
        return timedelta(milliseconds=node["v"])

    return node["v"]


def to_python(
    expr: "ViewExpression", field_var: str = "F", expr_var: str = "E"
) -> str:
    """Renders an expression as Python source.

    Args:
        expr: a :class:`fiftyone.core.expressions.ViewExpression`
        field_var ("F"): the name bound to
            :class:`fiftyone.core.expressions.ViewField`
        expr_var ("E"): the name bound to
            :class:`fiftyone.core.expressions.ViewExpression`

    Returns:
        Python source for the expression. Subexpressions built from raw
        MongoDB render as ``E(<mongo>)``, which is accurate but opaque.
    """
    source, _ = _render(node_of(expr), field_var, expr_var)
    return source


def _render(node: Node, fvar: str, evar: str) -> Tuple[str, Optional[int]]:
    """Returns ``(source, precedence)``; precedence is None for atoms."""
    t = node.get("t")

    if t == "field":
        return "%s(%r)" % (fvar, node["path"]), None

    if t == "lit":
        return _render_literal(node), None

    if t == "list":
        items = [_render(n, fvar, evar)[0] for n in node["items"]]
        return "[%s]" % ", ".join(items), None

    if t == "dict":
        entries = [
            "%s: %s"
            % (
                _render(k, fvar, evar)[0],
                _render(v, fvar, evar)[0],
            )
            for k, v in node["entries"]
        ]
        return "{%s}" % ", ".join(entries), None

    if t == "mongo":
        return "%s(%s)" % (evar, fou.pformat(node["expr"])), None

    if t == "static":
        args = _render_args(node, fvar, evar)
        return "%s.%s(%s)" % (evar, node["op"], args), None

    if t != "call":
        raise ValueError("unknown view expression node type %r" % t)

    op = node["op"]
    target = node["self"]

    if op in _PREFIX:
        inner, prec = _render(target, fvar, evar)
        return "%s%s" % (_PREFIX[op], _parenthesize(inner, prec, 7)), None

    if op in _BUILTIN_CALL:
        inner, _ = _render(target, fvar, evar)
        return "%s(%s)" % (_BUILTIN_CALL[op], inner), None

    if op == "__getitem__":
        inner, prec = _render(target, fvar, evar)
        index, _ = _render(node["args"][0], fvar, evar)
        return "%s[%s]" % (_parenthesize(inner, prec, 7), index), None

    if op == "__call__":
        inner, prec = _render(target, fvar, evar)
        args = _render_args(node, fvar, evar)
        return "%s(%s)" % (_parenthesize(inner, prec, 7), args), None

    symbol = _INFIX.get(op)
    reflected = _REFLECTED.get(op)
    if symbol or reflected:
        sym = symbol or reflected
        prec = _PRECEDENCE[sym]
        left_node, right_node = (
            (target, node["args"][0]) if symbol else (node["args"][0], target)
        )
        left, lprec = _render(left_node, fvar, evar)
        right, rprec = _render(right_node, fvar, evar)
        return (
            "%s %s %s"
            % (
                _parenthesize(left, lprec, prec),
                sym,
                _parenthesize(right, rprec, prec + 1),
            ),
            prec,
        )

    inner, prec = _render(target, fvar, evar)
    args = _render_args(node, fvar, evar)
    return "%s.%s(%s)" % (_parenthesize(inner, prec, 7), op, args), None


def _render_args(node: Node, fvar: str, evar: str) -> str:
    parts = [_render(n, fvar, evar)[0] for n in node.get("args", [])]
    parts.extend(
        "%s=%s" % (k, _render(v, fvar, evar)[0])
        for k, v in node.get("kwargs", {}).items()
    )
    return ", ".join(parts)


def _render_literal(node: LiteralNode) -> str:
    as_ = node.get("as")
    if as_ == "date":
        return "datetime.utcfromtimestamp(%r / 1000)" % node["v"]

    if as_ == "timedelta":
        return "timedelta(milliseconds=%r)" % node["v"]

    return repr(node["v"])


def _parenthesize(source: str, prec: Optional[int], needed: int) -> str:
    if prec is not None and prec < needed:
        return "(%s)" % source

    return source
