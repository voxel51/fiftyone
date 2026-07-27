/**
 * Copyright 2017-2026, Voxel51, Inc.
 *
 * The operator catalog the builder suggests from.
 *
 * Python validates view expressions against this same information, so the App
 * must not invent its own copy: the server serves it from
 * `fiftyone.core.expression_catalog` as `viewExpressionOperators` and
 * `viewExpressionFieldKinds`, alongside the `viewExpressionAstVersion` both
 * sides must agree on to exchange an envelope.
 */

/** The kind of value an operator accepts or produces. */
export type Kind =
  | "ANY"
  | "NUMBER"
  | "STRING"
  | "BOOLEAN"
  | "ARRAY"
  | "OBJECT"
  | "DATE"
  | "ID";

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

/**
 * TODO: replace with the `viewExpressionOperators` query. Held as a constant so
 * the editor can be built and tested before the Relay fragment is spread into
 * the dataset query — 128 operators is real payload, so it should ship with the
 * consumer rather than ahead of it.
 */
export const CATALOG: Operator[] = [
  {
    name: "__gt__",
    display: ">",
    selfKind: "ANY",
    argKinds: ["ANY"],
    returns: "BOOLEAN",
    minArgs: 1,
    maxArgs: 1,
    summary: "whether this value is greater than the given one",
  },
  {
    name: "__lt__",
    display: "<",
    selfKind: "ANY",
    argKinds: ["ANY"],
    returns: "BOOLEAN",
    minArgs: 1,
    maxArgs: 1,
    summary: "whether this value is less than the given one",
  },
  {
    name: "__eq__",
    display: "==",
    selfKind: "ANY",
    argKinds: ["ANY"],
    returns: "BOOLEAN",
    minArgs: 1,
    maxArgs: 1,
    summary: "whether this value equals the given one",
  },
  {
    name: "exists",
    display: "exists",
    selfKind: "ANY",
    argKinds: ["BOOLEAN"],
    returns: "BOOLEAN",
    minArgs: 0,
    maxArgs: 1,
    summary: "whether this field is not None",
  },
  {
    name: "is_in",
    display: "is_in",
    selfKind: "ANY",
    argKinds: ["ARRAY"],
    returns: "BOOLEAN",
    minArgs: 1,
    maxArgs: 1,
    summary: "whether this value appears in the given values",
  },
  {
    name: "abs",
    display: "abs",
    selfKind: "NUMBER",
    argKinds: [],
    returns: "NUMBER",
    minArgs: 0,
    maxArgs: 0,
    summary: "the absolute value",
  },
  {
    name: "round",
    display: "round",
    selfKind: "NUMBER",
    argKinds: ["NUMBER"],
    returns: "NUMBER",
    minArgs: 0,
    maxArgs: 1,
    summary: "this number rounded to the given number of places",
  },
  {
    name: "contains",
    display: "contains",
    selfKind: "STRING",
    argKinds: ["STRING"],
    returns: "BOOLEAN",
    minArgs: 1,
    maxArgs: 2,
    summary: "whether this string contains the given substring",
  },
  {
    name: "starts_with",
    display: "starts_with",
    selfKind: "STRING",
    argKinds: ["STRING"],
    returns: "BOOLEAN",
    minArgs: 1,
    maxArgs: 2,
    summary: "whether this string starts with the given prefix",
  },
  {
    name: "lower",
    display: "lower",
    selfKind: "STRING",
    argKinds: [],
    returns: "STRING",
    minArgs: 0,
    maxArgs: 0,
    summary: "this string in lowercase",
  },
  {
    name: "length",
    display: "length",
    selfKind: "ARRAY",
    argKinds: [],
    returns: "NUMBER",
    minArgs: 0,
    maxArgs: 0,
    summary: "the number of elements",
  },
  {
    name: "filter",
    display: "filter",
    selfKind: "ARRAY",
    argKinds: ["BOOLEAN"],
    returns: "ARRAY",
    minArgs: 1,
    maxArgs: 1,
    summary: "the elements matching the given expression",
  },
  {
    name: "any",
    display: "any",
    selfKind: "ARRAY",
    argKinds: [],
    returns: "BOOLEAN",
    minArgs: 0,
    maxArgs: 0,
    summary: "whether any element is truthy",
  },
  {
    name: "year",
    display: "year",
    selfKind: "DATE",
    argKinds: [],
    returns: "NUMBER",
    minArgs: 0,
    maxArgs: 0,
    summary: "the year of this date",
  },
  {
    name: "to_string",
    display: "to_string",
    selfKind: "ID",
    argKinds: [],
    returns: "STRING",
    minArgs: 0,
    maxArgs: 0,
    summary: "this id as a string",
  },
];
