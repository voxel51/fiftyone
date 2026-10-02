"""
Model evaluation custom-code scenario tests.

| Copyright 2017-2026, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""

from textwrap import dedent

import pytest

from fiftyone.core.expressions import ViewExpression

from plugins.operators.model_evaluation.utils import (
    CustomCodeViewReason,
    ScenarioType,
    get_scenario_example,
)
from plugins.utils.model_evaluation import get_subsets_from_custom_code
from plugins.utils.model_evaluation.custom_code import (
    CustomCodeError,
    run_custom_code,
)


def _reference_get_subsets(custom_code):
    """Runs custom code as plain Python, the reference semantics that
    :func:`get_subsets_from_custom_code` reproduces.
    """
    try:
        local_vars = {}
        exec(custom_code, {"ctx": None}, local_vars)
        data = local_vars.get("subsets", {})
        if len(data) == 0:
            return None, "No subsets found in the custom code."
        return data, None
    except Exception as e:
        return None, str(e)


def _normalize(value):
    if isinstance(value, ViewExpression):
        return ("ViewExpression", _normalize(value.to_mongo()))

    if isinstance(value, dict):
        return {k: _normalize(v) for k, v in value.items()}

    if isinstance(value, (list, tuple)):
        return type(value)(_normalize(v) for v in value)

    return value


def _scenario_examples():
    examples = []
    reasons = [ScenarioType.CUSTOM_CODE] + list(CustomCodeViewReason)
    types = [
        ScenarioType.CUSTOM_CODE,
        ScenarioType.SAMPLE_FIELD,
        ScenarioType.LABEL_ATTRIBUTE,
    ]
    for reason in reasons:
        for type_ in types:
            for field in (None, "uniqueness", "ground_truth.confidence"):
                code = get_scenario_example(reason, type_, field)
                if code and code not in examples:
                    examples.append(code)

    return examples


DOCUMENTED_EXAMPLES = [
    """
    from fiftyone import ViewField as F

    bbox_area = (
        F("bounding_box")[2] * F("$metadata.frame_height")
        * F("bounding_box")[3] * F("$metadata.frame_width")
    )

    subsets = {
        "Small objects": dict(type="attribute", expr=bbox_area < 32**2),
        "Medium objects": dict(type="attribute", expr=(32**2 <= bbox_area) & (bbox_area <= 96**2)),
        "Large objects": dict(type="attribute", expr=bbox_area > 96**2),
    }
    """,
    """
    from fiftyone import ViewField as F

    subsets = {
        "Night": {"type": "sample", "field": "timeofday", "value": "night"},
        "Unique": {"type": "field", "expr": F("uniqueness") > 0.75},
        "Sedans": {"type": "attribute", "field": "type", "value": "sedan"},
        "Saved view": {"type": "view", "view": "night_view"},
    }
    """,
    """
    from fiftyone import ViewField as F

    # Compound subsets
    bbox_area = F("bounding_box")[2] * F("bounding_box")[3]
    subsets = {
        "Unique nights": [
            {"type": "field", "field": "timeofday", "value": "night"},
            {"type": "field", "expr": F("uniqueness") > 0.75},
        ],
        "Medium nights": [
            {"type": "field", "field": "timeofday", "value": "night"},
            {
                "type": "attribute",
                "expr": (0.05 <= bbox_area) & (bbox_area <= 0.5),
            },
        ],
        "Sedans in view": [
            {"type": "view", "view": "night_view"},
            {"type": "attribute", "field": "type", "value": "sedan"},
        ],
    }
    """,
]

OTHER_EXAMPLES = [
    # Expression methods, static methods, negation and boolean operators
    """
    from fiftyone import ViewField as F, ViewExpression as E

    num_objects = F("ground_truth.detections").length()
    subsets = {
        "crowded": dict(type="field", expr=num_objects >= 10),
        "empty": dict(type="field", expr=~(num_objects > 0)),
        "tagged": dict(type="field", expr=F("tags").contains("validated")),
        "classes": dict(type="attribute", expr=F("label").is_in(["car", "bus"])),
        "either": dict(type="attribute", expr=(F("label") == "car") | (F("confidence") > 0.9)),
        "literal": dict(type="field", expr=F("x") == E.literal(3)),
        "sliced": dict(type="attribute", expr=F("bounding_box")[:2][0] > -0.1),
    }
    """,
    # Module path import, chained names, augmented assignment, f-strings,
    # unpacking and builtins
    """
    from fiftyone.core.expressions import ViewField

    low, high = 0.25, 0.75
    width = ViewField("bounding_box")[2]
    scale = 2
    scale *= 2
    name = f"{int(low * 100)}-{high:.2f} x{scale}"
    thresholds = sorted([high, low])
    subsets = {
        name: dict(type="attribute", expr=width * scale > max(thresholds)),
        "rest": dict(type="attribute", expr=width <= min(thresholds)),
        **{"extra": dict(type="field", expr=ViewField("n") > len(name))},
    }
    """,
    # Conditional expressions and plain-Python comparisons
    """
    from fiftyone import ViewField as F

    use_pixels = 1 < 2 <= 3
    limit = 32**2 if use_pixels else 0.05
    subsets = {"small": dict(type="attribute", expr=F("area") < limit)}
    """,
    # Plain-Python boolean and comparison results
    """
    subsets = {
        "and": (0 or 2) and 3,
        "or": 0 or [] or "",
        "chain": 1 < 2 < 1,
        "not": not 0,
        "membership": 2 in [1, 2] and 3 not in (1, 2),
        "identity": None is None,
        "unary": -(+3) + ~1,
        "division": (7 // 2, 7 % 2, 7 / 2, 1 << 3, 8 >> 1, 6 ^ 3),
        "set": {1, 2},
    }
    """,
    # Formatting, rounding, sorting keys and sequence sums
    """
    from fiftyone import ViewField as F

    pct = "%5.2f|%-6s|%*d|%%" % (3.14159, "x", 4, 7)
    named = "%(a)03d" % {"a": 5}
    spec = f"{0.5:>10.3f}|{'a':*^9}|{12:08,d}"
    rounded = (round(1234, -2), round(5, -50), round(-15, ndigits=-1))
    rounded += (round(2.675, 2), round(True, -3), round(7, 3))
    keyed = sorted(["ccc", "a", "bb"], key=len)
    biggest = max(["ccc", "a", "bb"], key=len)
    flat = sum([[1], [2, 3]], [])
    shifted = (True << 3, 1 << 64, 0 << 10**9, (-1) ** 10**9, 1 ** 10**9)
    chained = F("a") + 1 + 1 + 1 + 1 + 1 + 1 + 1 + 1 + 1 + 1
    subsets = {
        "values": [pct, named, spec, rounded, keyed, biggest, flat, shifted],
        "deep": dict(type="field", expr=chained > 0),
        "called": dict(type="field", expr=F("a")("b") > 0),
    }
    """,
    # A list rather than a dict
    """
    from fiftyone import ViewField as F

    subsets = [dict(type="field", expr=F("uniqueness") > 0.5)]
    """,
]

ERROR_EXAMPLES = [
    "",
    "x = 1",
    "subsets = {}",
    "subsets = 5",
    "subsets = {'a': undefined_name}",
    "subsets = {",
    "from fiftyone import ViewField as F\nsubsets = {'a': F('x') > }",
]


def _dedent(code):
    return dedent(code).strip()


@pytest.mark.parametrize(
    "code",
    _scenario_examples() + DOCUMENTED_EXAMPLES + OTHER_EXAMPLES,
)
def test_matches_reference_semantics(code):
    code = _dedent(code)
    expected, expected_error = _reference_get_subsets(code)
    actual, actual_error = get_subsets_from_custom_code(None, code)

    assert expected_error is None
    assert actual_error is None
    assert _normalize(actual) == _normalize(expected)


@pytest.mark.parametrize("code", ERROR_EXAMPLES)
def test_matches_reference_errors(code):
    code = _dedent(code)
    expected, expected_error = _reference_get_subsets(code)
    actual, actual_error = get_subsets_from_custom_code(None, code)

    assert expected is None
    assert actual is None
    assert actual_error == expected_error


def test_scenario_examples_are_covered():
    assert len(_scenario_examples()) >= 4


def test_returns_assigned_names():
    names = run_custom_code(_dedent("""
            from fiftyone import ViewField as F
            a = 1
            b = a + 1
            """))

    assert set(names) == {"F", "a", "b"}
    assert names["b"] == 2


def test_expression_size_is_bounded():
    code = "from fiftyone import ViewField as F\ne = F('a')\n"
    code += "e = e + e\n" * 40

    with pytest.raises(CustomCodeError):
        run_custom_code(code)


def test_round_to_large_negative_digits():
    names = run_custom_code(
        "x = round(5, -10 ** 9)\ny = round(-7, ndigits=-10 ** 9)"
    )

    assert names["x"] == 0
    assert names["y"] == 0


def test_code_length_is_bounded():
    with pytest.raises(CustomCodeError):
        run_custom_code("x = 1\n" * 1000000)


def test_non_string_code_is_an_error():
    subsets, error = get_subsets_from_custom_code(None, None)

    assert subsets is None
    assert error


UNSUPPORTED_EXAMPLES = [
    # Imports outside the expression classes
    "import fiftyone",
    "import os",
    "from os import path",
    "from fiftyone import Dataset",
    "from fiftyone.core.expressions import _escape_regex_chars",
    "from . import custom_code",
    # Attributes other than public expression attributes
    "from fiftyone import ViewField as F\nx = F('a').__class__",
    "from fiftyone import ViewField as F\nx = F.__init__",
    "from fiftyone import ViewField as F\nx = F('a')._expr",
    "from fiftyone import ViewField as F\nx = F('a').to_mongo.__self__",
    "x = 'a'.join",
    "x = (1).real",
    "x = [1].append",
    "x = {}.update",
    # Calls of values that are not allowed callables
    "x = dict(a=1)\ny = x()",
    "from fiftyone import ViewField as F\nx = F('a').to_mongo()\ny = x()",
    "from fiftyone import ViewField as F\nx = F.to_mongo({})",
    # Statements outside the supported subset
    "def f():\n    pass",
    "class A:\n    pass",
    "for i in [1]:\n    pass",
    "if True:\n    x = 1",
    "while False:\n    pass",
    "with x:\n    pass",
    "try:\n    pass\nexcept Exception:\n    pass",
    "del x",
    "global x",
    "x: int = 1",
    "raise ValueError()",
    "assert True",
    "x = [1]\nx[0] = 2",
    "x = [1]\nx[0] += 2",
    "a, *b = [1, 2]",
    # Expressions outside the supported subset
    "x = lambda: 1",
    "x = [i for i in [1]]",
    "x = {i: i for i in [1]}",
    "x = (i for i in [1])",
    "x = {i for i in [1]}",
    "x = (y := 1)",
    # Results beyond the size bounds
    "x = 10 ** 1000000",
    "x = 2 ** 2 ** 2 ** 2 ** 2 ** 2",
    "x = 1 << 1000000",
    "x = 'a' * 1000000",
    "x = [0] * 1000000",
    "x = 10 ** 10000\nx = x * x * x * x",
    "x = [0] * 1000\nx = x + x\nx = x * 100",
    "x = 1 << 10 ** 10",
    "x = True << 10 ** 10",
    "x = '%*d' % (10 ** 9, 1)",
    "x = '%999999999d' % 1",
    "x = b'%.999999999f' % 1.0",
    "x = f'{1:999999999}'",
    "x = f'{1.0:.999999999f}'",
    "x = [0] * 1000\n" + "x = [x, x]\n" * 40,
    "x = [[0] * 1000] * 1000\ny = sum(x, [])",
    "x = [0] * 100000\n" + "y = x == x\n" * 200,
    "x = 'a' * 1000000",
    # Values that are not expressions or allowed callables
    "from fiftyone import ViewField as F\nx = F.mro()",
    "from fiftyone import ViewExpression as E\nx = sorted([1], key=E.to_mongo)",
    # Iteration over expressions
    "from fiftyone import ViewField as F\nx = list(F('a'))",
    "from fiftyone import ViewField as F\nx = [*F('a')]",
    "from fiftyone import ViewField as F\na, b = F('a')",
    "from fiftyone import ViewField as F\nx = {**F('a')}",
    "from fiftyone import ViewField as F\nx = dict(**F('a'))",
    "from fiftyone import ViewField as F\nx = sorted(F('a'))",
]


UNDEFINED_NAME_EXAMPLES = [
    "subsets = {'a': ctx}",
    "subsets = {'a': open}",
    "subsets = {'a': getattr}",
    "subsets = {'a': type}",
    "subsets = {'a': eval}",
    "subsets = {'a': __import__}",
    "subsets = {'a': __builtins__}",
    "subsets = {'a': F}",
]


@pytest.mark.parametrize("code", UNDEFINED_NAME_EXAMPLES)
def test_rejects_names_outside_allowed_builtins(code):
    with pytest.raises(NameError):
        run_custom_code(code)


@pytest.mark.parametrize("code", UNSUPPORTED_EXAMPLES)
def test_rejects_unsupported_code(code):
    with pytest.raises(CustomCodeError):
        run_custom_code(code)


@pytest.mark.parametrize(
    "code", UNSUPPORTED_EXAMPLES + UNDEFINED_NAME_EXAMPLES
)
def test_unsupported_code_is_reported_as_an_error(code):
    subsets, error = get_subsets_from_custom_code(None, code)

    assert subsets is None
    assert error
