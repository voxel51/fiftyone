# Expression fixtures

`expressions.json` is generated from the Python that owns the format, so the
App's parser and printer are tested against what the server actually produces
rather than against hand-written guesses.

Each entry carries the same expression in four forms:

- `python` — the source, as `ViewExpression.to_python()` renders it
- `ast` — the syntax tree, as `to_ast()` produces it
- `mongo` — the lowering, as `to_mongo()` produces it
- `reconstructible` — false when the expression was built from raw MongoDB and
  so has no syntax to render

The App owes two round trips against these: parsing `python` must yield `ast`,
and printing `ast` must yield `python`. Every fixture was checked to
reconstruct to identical `mongo` before being written, so a failure is the
App's.

Regenerate after changing `fiftyone/core/expression_ast.py`:

    python3 tests/generate_expression_fixtures.py
