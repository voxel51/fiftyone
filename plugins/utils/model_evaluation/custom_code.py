"""
Evaluation of custom-code scenario subset definitions.

Custom-code scenarios are short Python snippets that import ``ViewField``
and/or ``ViewExpression``, assign intermediate expressions to names, and
define a ``subsets`` dict that maps subset names to subset definitions::

    from fiftyone import ViewField as F

    bbox_area = F("bounding_box")[2] * F("bounding_box")[3]
    subsets = {
        "Small objects": dict(type="attribute", expr=bbox_area <= 0.05),
        "Large objects": dict(type="attribute", expr=bbox_area > 0.5),
    }

This module evaluates such snippets by walking their syntax tree. The
supported language is:

-   statements: ``from <module> import <name> [as <alias>]`` for the
    expression classes listed in :data:`ALLOWED_IMPORTS`, assignments and
    augmented assignments to plain names, ``pass``, and bare expressions
-   expressions: literals, containers, f-strings, arithmetic, bitwise,
    boolean and comparison operators, conditional expressions, subscripts
    and slices
-   names: those bound by earlier statements and the builtins listed in
    :data:`ALLOWED_BUILTINS`
-   attributes: public attributes of
    :class:`fiftyone.core.expressions.ViewExpression` classes and instances
-   calls: the expression classes, their static methods, the public methods
    of expression instances, and the builtins listed in
    :data:`ALLOWED_BUILTINS`

Anything else raises a :class:`CustomCodeError`.

| Copyright 2017-2026, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""

import ast
import inspect
import operator

from fiftyone.core.expressions import ViewExpression, ViewField

ALLOWED_IMPORTS = {
    "fiftyone": {
        "ViewField": ViewField,
        "ViewExpression": ViewExpression,
    },
    "fiftyone.core.expressions": {
        "ViewField": ViewField,
        "ViewExpression": ViewExpression,
    },
}

ALLOWED_BUILTINS = {
    "abs": abs,
    "all": all,
    "any": any,
    "bool": bool,
    "dict": dict,
    "float": float,
    "int": int,
    "len": len,
    "list": list,
    "max": max,
    "min": min,
    "round": round,
    "set": set,
    "sorted": sorted,
    "str": str,
    "sum": sum,
    "tuple": tuple,
}

# Size bounds on the values that arithmetic in custom code may produce
MAX_INT_BITS = 100000
MAX_SEQUENCE_LENGTH = 100000

_BIN_OPS = {
    ast.Add: operator.add,
    ast.Sub: operator.sub,
    ast.Mult: operator.mul,
    ast.Div: operator.truediv,
    ast.FloorDiv: operator.floordiv,
    ast.Mod: operator.mod,
    ast.Pow: operator.pow,
    ast.LShift: operator.lshift,
    ast.RShift: operator.rshift,
    ast.BitAnd: operator.and_,
    ast.BitOr: operator.or_,
    ast.BitXor: operator.xor,
}

_UNARY_OPS = {
    ast.UAdd: operator.pos,
    ast.USub: operator.neg,
    ast.Invert: operator.invert,
    ast.Not: operator.not_,
}

_COMPARE_OPS = {
    ast.Eq: operator.eq,
    ast.NotEq: operator.ne,
    ast.Lt: operator.lt,
    ast.LtE: operator.le,
    ast.Gt: operator.gt,
    ast.GtE: operator.ge,
    ast.Is: operator.is_,
    ast.IsNot: operator.is_not,
    ast.In: lambda a, b: a in b,
    ast.NotIn: lambda a, b: a not in b,
}

_EXPRESSION_CLASSES = (ViewExpression, ViewField)

_ALLOWED_CALLABLES = set(ALLOWED_BUILTINS.values()) | set(_EXPRESSION_CLASSES)

# Static methods such as ``ViewField.literal()``
_STATIC_METHODS = {
    getattr(cls, name)
    for cls in _EXPRESSION_CLASSES
    for name in dir(cls)
    if not name.startswith("_")
    and isinstance(inspect.getattr_static(cls, name), staticmethod)
}


class CustomCodeError(ValueError):
    """Raised when custom code uses syntax outside the supported language."""


def run_custom_code(code):
    """Evaluates the given custom code and returns the names it defines.

    Args:
        code: a string of custom code

    Returns:
        a dict mapping the names assigned by the code to their values

    Raises:
        CustomCodeError: if the code uses unsupported syntax
    """
    if not isinstance(code, str):
        raise CustomCodeError(
            "Custom code must be a string, not %s" % type(code).__name__
        )

    tree = ast.parse(code, filename="<string>", mode="exec")
    evaluator = _Evaluator()
    for stmt in tree.body:
        evaluator.run(stmt)

    return evaluator.names


def _unsupported(node, what=None):
    if what is None:
        what = type(node).__name__

    lineno = getattr(node, "lineno", None)
    where = " (line %d)" % lineno if lineno is not None else ""
    return CustomCodeError(
        "Unsupported syntax in custom code%s: %s" % (where, what)
    )


def _is_expression_object(value):
    if isinstance(value, ViewExpression):
        return True

    return isinstance(value, type) and issubclass(value, ViewExpression)


def _is_allowed_callable(func):
    if _is_expression_object(func):
        return True

    try:
        if func in _ALLOWED_CALLABLES or func in _STATIC_METHODS:
            return True
    except TypeError:
        pass

    owner = getattr(func, "__self__", None)
    return owner is not None and _is_expression_object(owner)


def _is_int(value):
    return isinstance(value, int) and not isinstance(value, bool)


def _apply_binop(node, op, left, right):
    if _is_int(left) and _is_int(right) and abs(left) > 1:
        if isinstance(node, ast.Pow) and right > 0:
            bits = abs(left).bit_length() * right
        elif isinstance(node, ast.LShift) and right > 0:
            bits = abs(left).bit_length() + right
        else:
            bits = 0

        if bits > MAX_INT_BITS:
            raise CustomCodeError("Integer result too large in custom code")

    if isinstance(node, ast.Mult):
        for seq, count in ((left, right), (right, left)):
            if isinstance(seq, (str, bytes, list, tuple)) and _is_int(count):
                if len(seq) * count > MAX_SEQUENCE_LENGTH:
                    raise CustomCodeError(
                        "Sequence result too long in custom code"
                    )

    result = op(left, right)

    if _is_int(result) and result.bit_length() > MAX_INT_BITS:
        raise CustomCodeError("Integer result too large in custom code")

    if (
        isinstance(result, (str, bytes, list, tuple))
        and len(result) > MAX_SEQUENCE_LENGTH
    ):
        raise CustomCodeError("Sequence result too long in custom code")

    return result


class _Evaluator(object):
    def __init__(self):
        self.names = {}

    # Statements

    def run(self, node):
        method = getattr(self, "_run_" + type(node).__name__, None)
        if method is None:
            raise _unsupported(node)

        method(node)

    def _run_ImportFrom(self, node):
        if node.level != 0 or node.module not in ALLOWED_IMPORTS:
            raise _unsupported(node, "import from '%s'" % node.module)

        available = ALLOWED_IMPORTS[node.module]
        for alias in node.names:
            if alias.name not in available:
                raise _unsupported(
                    node, "import of '%s.%s'" % (node.module, alias.name)
                )

            self.names[alias.asname or alias.name] = available[alias.name]

    def _run_Assign(self, node):
        value = self.eval(node.value)
        for target in node.targets:
            self._assign(target, value)

    def _run_AugAssign(self, node):
        if not isinstance(node.target, ast.Name):
            raise _unsupported(node, "augmented assignment target")

        op = _BIN_OPS.get(type(node.op), None)
        if op is None:
            raise _unsupported(node, type(node.op).__name__)

        left = self._load(node.target)
        right = self.eval(node.value)
        self.names[node.target.id] = _apply_binop(node.op, op, left, right)

    def _run_Expr(self, node):
        self.eval(node.value)

    def _run_Pass(self, node):
        pass

    def _assign(self, target, value):
        if isinstance(target, ast.Name):
            self.names[target.id] = value
            return

        if isinstance(target, (ast.Tuple, ast.List)):
            if any(isinstance(elt, ast.Starred) for elt in target.elts):
                raise _unsupported(target, "starred assignment")

            values = list(value)
            if len(values) != len(target.elts):
                raise ValueError(
                    "expected %d values to unpack, got %d"
                    % (len(target.elts), len(values))
                )

            for elt, val in zip(target.elts, values):
                self._assign(elt, val)

            return

        raise _unsupported(target, "assignment target")

    # Expressions

    def eval(self, node):
        method = getattr(self, "_eval_" + type(node).__name__, None)
        if method is None:
            raise _unsupported(node)

        return method(node)

    def _load(self, node):
        name = node.id
        if name in self.names:
            return self.names[name]

        if name in ALLOWED_BUILTINS:
            return ALLOWED_BUILTINS[name]

        raise NameError("name '%s' is not defined" % name)

    def _eval_Constant(self, node):
        return node.value

    def _eval_Name(self, node):
        return self._load(node)

    def _eval_JoinedStr(self, node):
        return "".join(str(self.eval(value)) for value in node.values)

    def _eval_FormattedValue(self, node):
        value = self.eval(node.value)
        if node.conversion == ord("s"):
            value = str(value)
        elif node.conversion == ord("r"):
            value = repr(value)
        elif node.conversion == ord("a"):
            value = ascii(value)

        spec = self.eval(node.format_spec) if node.format_spec else ""
        return format(value, spec)

    def _eval_elts(self, elts):
        values = []
        for elt in elts:
            if isinstance(elt, ast.Starred):
                values.extend(self.eval(elt.value))
            else:
                values.append(self.eval(elt))

        return values

    def _eval_List(self, node):
        return self._eval_elts(node.elts)

    def _eval_Tuple(self, node):
        return tuple(self._eval_elts(node.elts))

    def _eval_Set(self, node):
        return set(self._eval_elts(node.elts))

    def _eval_Dict(self, node):
        result = {}
        for key, value in zip(node.keys, node.values):
            if key is None:
                result.update(self.eval(value))
            else:
                result[self.eval(key)] = self.eval(value)

        return result

    def _eval_BinOp(self, node):
        op = _BIN_OPS.get(type(node.op), None)
        if op is None:
            raise _unsupported(node, type(node.op).__name__)

        left = self.eval(node.left)
        right = self.eval(node.right)
        return _apply_binop(node.op, op, left, right)

    def _eval_UnaryOp(self, node):
        op = _UNARY_OPS[type(node.op)]
        return op(self.eval(node.operand))

    def _eval_BoolOp(self, node):
        # As in Python, every operand but the last is tested for truth, and
        # the result is the operand that decided it
        is_and = isinstance(node.op, ast.And)
        for operand in node.values[:-1]:
            value = self.eval(operand)
            if bool(value) != is_and:
                return value

        return self.eval(node.values[-1])

    def _eval_Compare(self, node):
        # As in Python, ``a < b < c`` is ``(a < b) and (b < c)`` with ``b``
        # evaluated once
        left = self.eval(node.left)
        last = len(node.ops) - 1
        for idx, (op, comparator) in enumerate(
            zip(node.ops, node.comparators)
        ):
            right = self.eval(comparator)
            result = _COMPARE_OPS[type(op)](left, right)
            if idx < last and not result:
                return result

            left = right

        return result

    def _eval_IfExp(self, node):
        if self.eval(node.test):
            return self.eval(node.body)

        return self.eval(node.orelse)

    def _eval_Subscript(self, node):
        return self.eval(node.value)[self.eval(node.slice)]

    def _eval_Slice(self, node):
        lower = self.eval(node.lower) if node.lower is not None else None
        upper = self.eval(node.upper) if node.upper is not None else None
        step = self.eval(node.step) if node.step is not None else None
        return slice(lower, upper, step)

    def _eval_Attribute(self, node):
        if node.attr.startswith("_"):
            raise _unsupported(node, "attribute '%s'" % node.attr)

        value = self.eval(node.value)
        if not _is_expression_object(value):
            raise _unsupported(
                node,
                "attribute '%s' of %s" % (node.attr, type(value).__name__),
            )

        return getattr(value, node.attr)

    def _eval_Call(self, node):
        func = self.eval(node.func)
        if not _is_allowed_callable(func):
            raise _unsupported(node, "call of %r" % (func,))

        args = self._eval_elts(node.args)
        kwargs = {}
        for keyword in node.keywords:
            if keyword.arg is None:
                kwargs.update(self.eval(keyword.value))
            else:
                kwargs[keyword.arg] = self.eval(keyword.value)

        return func(*args, **kwargs)
