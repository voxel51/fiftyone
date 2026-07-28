"""
FiftyOne Server view expression definitions

| Copyright 2017-2026, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|

The App builds view expressions, so it needs the same type information Python
uses to validate them: which operators exist, what each one accepts and
returns, and what kind of value a field of a given type holds. That information
lives in :mod:`fiftyone.core.expression_catalog`; this module serves it.
"""

import typing as t

import strawberry as gql

from fiftyone.core.expression_ast import AST_VERSION
import fiftyone.core.expression_catalog as focx

Kind = gql.enum(
    focx.Kind,
    description=(
        "The kind of value a view expression operator accepts or produces"
    ),
)


@gql.type
class ViewExpressionOperator:
    """One operator on
    :class:`fiftyone.core.expressions.ViewExpression`, with everything needed
    to suggest it and to validate its operands.
    """

    name: str
    display: str
    syntax: str
    self_kind: Kind
    arg_kinds: t.List[Kind]
    returns: Kind
    min_args: int
    max_args: t.Optional[int]
    reflected: bool
    typed: bool
    summary: str


@gql.type
class FieldKind:
    """The kind of value a field type holds, keyed by the ``ftype`` the App
    receives on a field schema.
    """

    ftype: str
    kind: Kind


def view_expression_operators() -> t.List[ViewExpressionOperator]:
    return [
        ViewExpressionOperator(
            name=spec["name"],
            display=spec["display"],
            syntax=spec["syntax"],
            self_kind=focx.Kind(spec["self_kind"]),
            arg_kinds=[focx.Kind(kind) for kind in spec["arg_kinds"]],
            returns=focx.Kind(spec["returns"]),
            min_args=spec["min_args"],
            max_args=spec["max_args"],
            reflected=spec["reflected"],
            typed=spec["typed"],
            summary=spec["summary"],
        )
        for spec in focx.build_catalog()
    ]


def view_expression_field_kinds() -> t.List[FieldKind]:
    return [
        FieldKind(ftype=ftype, kind=kind)
        for ftype, kind in sorted(focx.field_kinds_by_ftype().items())
    ]


def view_expression_ast_version() -> int:
    return AST_VERSION
