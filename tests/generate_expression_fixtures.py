"""
Regenerates expressions.json from the Python that owns the format.

| Copyright 2017-2026, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|

Run from the repository root::

    python3 tests/generate_expression_fixtures.py

Every case is checked to reconstruct to identical MongoDB before it is written,
so a round-trip failure in the App's tests is the App's and not the fixture's.
"""

import json
import os
from datetime import datetime

from fiftyone import ViewExpression as E
from fiftyone import ViewField as F

CASES = [
    ("comparison", lambda: F("confidence") > 0.5),
    ("equality", lambda: F("label") == "cat"),
    (
        "conjunction",
        lambda: (F("confidence") > 0.5) & F("label").is_in(["a", "b"]),
    ),
    ("disjunction", lambda: (F("a") > 1) | (F("b") < 2)),
    ("negation", lambda: ~(F("x") > 1)),
    ("arithmetic", lambda: (F("a") + F("b")) * 2),
    ("reflected", lambda: 2 - F("a")),
    ("length_idiom", lambda: F("preds.detections").length() > 2),
    (
        "filter_then_length",
        lambda: F("preds.detections").filter(F("confidence") > 0.9).length(),
    ),
    ("exists", lambda: F("x").exists()),
    ("string_chain", lambda: F("tag").lower().starts_with("a")),
    ("index_then_call", lambda: F("preds.detections")[0]("label")),
    ("static_any", lambda: E.any([F("a") > 1, F("b") > 2])),
    ("static_all", lambda: E.all([F("a") > 1, F("b") > 2])),
    ("literal", lambda: E.literal("x")),
    ("date_compare", lambda: F("created_at") > datetime(2020, 1, 1)),
    ("frozen_field", lambda: F("$x") > 1),
    ("raw_mongo", lambda: E({"$gt": ["$x", 1]})),
]


def main():
    fixtures = []
    for name, build in CASES:
        expr = build()
        node = expr.to_ast()
        mongo = expr.to_mongo()

        rebuilt = E.from_ast(node).to_mongo()
        if rebuilt != mongo:
            raise AssertionError(
                "%s does not round trip:\n  %r\n  %r" % (name, mongo, rebuilt)
            )

        fixtures.append(
            {
                "name": name,
                "python": expr.to_python(),
                "ast": node,
                "mongo": mongo,
                "reconstructible": expr.is_reconstructible,
            }
        )

    path = os.path.join(
        os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
        "app",
        "packages",
        "view-bar",
        "src",
        "__fixtures__",
        "expressions.json",
    )
    with open(path, "w") as f:
        # 4-space indent matches prettier, so regenerating is a no-op diff
        json.dump(fixtures, f, indent=4)
        f.write("\n")

    print("wrote %d fixtures -> %s" % (len(fixtures), path))


if __name__ == "__main__":
    main()
