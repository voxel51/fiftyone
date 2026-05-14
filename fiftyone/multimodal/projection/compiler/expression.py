"""
Expression engine stub for CEL expressions in projection manifests.

CEL expressions appear in channel binding `where` clauses, column `value.expr`
fields, and column `compute.expr` fields. This module captures them verbatim
and defers evaluation to a future expression engine implementation.

| Copyright 2017-2026, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""

from __future__ import annotations

import abc
from dataclasses import dataclass, field
from typing import Any


@dataclass
class CapturedExpression:
    """A CEL expression string captured at compile time."""

    expr: str
    # Source location hint for error reporting.
    context_hint: str = ""
    # Column/source IDs this expression depends on, if declared.
    depends_on: list[str] = field(default_factory=list)

    def __str__(self) -> str:
        return self.expr


class ExpressionEngine(abc.ABC):
    """Evaluates CEL expressions against a runtime context."""

    @abc.abstractmethod
    def evaluate(
        self, expr: CapturedExpression, context: dict[str, Any]
    ) -> Any:
        """Evaluate a captured expression against the given context.

        Args:
            expr: the compiled expression to evaluate
            context: name -> value bindings available to the expression

        Returns:
            the result of evaluating the expression
        """
        raise NotImplementedError


class StubExpressionEngine(ExpressionEngine):
    """Placeholder engine — raises at evaluation time.

    Used by the PoC compiler so expression capture works end-to-end without
    requiring a real CEL runtime. Replace with a concrete implementation once
    the expression engine is ready.
    """

    def evaluate(
        self, expr: CapturedExpression, context: dict[str, Any]
    ) -> Any:
        raise NotImplementedError(
            f"Expression evaluation is not yet implemented. "
            f"Expression: {expr.expr!r}"
            + (f" (in {expr.context_hint})" if expr.context_hint else "")
        )
