/**
 * Copyright 2017-2026, Voxel51, Inc.
 *
 * The operator catalog the builder suggests from.
 *
 * Python validates view expressions against this same information, so the App
 * must not invent its own copy: the server serves it from
 * `fiftyone.core.expression_catalog` as `viewExpressionOperators` and
 * `viewExpressionFieldKinds`, alongside the `viewExpressionAstVersion` both
 * sides must agree on to exchange an envelope. This module narrows those rows
 * to the shapes the editor consumes.
 */

const KIND_NAMES = [
  "ANY",
  "NUMBER",
  "STRING",
  "BOOLEAN",
  "ARRAY",
  "OBJECT",
  "DATE",
  "ID",
] as const;

/** The kind of value an operator accepts or produces. */
export type Kind = (typeof KIND_NAMES)[number];

export interface Operator {
  /** Method name on `ViewExpression`, e.g. `__gt__`. */
  name: string;
  /** How it is written, e.g. `>` for `__gt__`. */
  display: string;
  /** The kind it applies to. */
  selfKind: Kind;
  argKinds: Kind[];
  returns: Kind;
  minArgs: number;
  maxArgs: number | null;
  summary: string;
}

const KINDS: ReadonlySet<string> = new Set(KIND_NAMES);

/**
 * A kind the server sent, as this editor's union. A value this build does not
 * know — a newer server may add kinds — reads as `ANY`, which filters nothing
 * out rather than hiding operators the editor cannot classify.
 */
const asKind = (value: string): Kind =>
  KINDS.has(value) ? (value as Kind) : "ANY";

/** One `viewExpressionOperators` row, as the query returns it. */
export interface OperatorRow {
  readonly name: string;
  readonly display: string;
  readonly selfKind: string;
  readonly argKinds: readonly string[];
  readonly returns: string;
  readonly minArgs: number;
  readonly maxArgs: number | null;
  readonly summary: string;
}

/** The server's operator catalog, as the editor consumes it. */
export const operatorsFrom = (rows: readonly OperatorRow[]): Operator[] =>
  rows.map((row) => ({
    name: row.name,
    display: row.display,
    selfKind: asKind(row.selfKind),
    argKinds: row.argKinds.map(asKind),
    returns: asKind(row.returns),
    minArgs: row.minArgs,
    maxArgs: row.maxArgs,
    summary: row.summary,
  }));

/**
 * What kind of value a field holds, keyed by the `ftype` the App's schema
 * reports for it, from `viewExpressionFieldKinds`.
 */
export const kindsByFtype = (
  rows: readonly { readonly ftype: string; readonly kind: string }[],
): ReadonlyMap<string, Kind> =>
  new Map(rows.map((row) => [row.ftype, asKind(row.kind)]));
