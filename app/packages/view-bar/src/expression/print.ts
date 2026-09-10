/**
 * Copyright 2017-2026, Voxel51, Inc.
 *
 * Renders a view expression tree as Python source, mirroring
 * `expression_ast.to_python`. The App shows expressions in the same syntax
 * users write in a notebook, so what is on screen can be copied out and what is
 * copied in can be parsed back.
 */

import type { CallNode, Node, StaticNode } from "./types";

const INFIX: Record<string, string> = {
  __eq__: "==",
  __ne__: "!=",
  __gt__: ">",
  __ge__: ">=",
  __lt__: "<",
  __le__: "<=",
  __add__: "+",
  __sub__: "-",
  __mul__: "*",
  __truediv__: "/",
  __mod__: "%",
  __pow__: "**",
  __and__: "&",
  __or__: "|",
};

/** Same syntax as their forward counterpart, operands swapped. */
const REFLECTED: Record<string, string> = {
  __radd__: "+",
  __rsub__: "-",
  __rmul__: "*",
  __rtruediv__: "/",
  __rmod__: "%",
  __rand__: "&",
  __ror__: "|",
};

const PREFIX: Record<string, string> = { __invert__: "~" };

const BUILTIN_CALL: Record<string, string> = {
  __abs__: "abs",
  __ceil__: "math.ceil",
  __floor__: "math.floor",
  __round__: "round",
  __len__: "len",
};

/**
 * Python operator precedence, loosest first. `&` and `|` bind tighter than
 * comparisons in Python, which is why `(F("x") > 1) & ...` needs its
 * parentheses.
 */
const PRECEDENCE: Record<string, number> = {
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
};

/** Tighter than every operator, so an atom is never parenthesized. */
const ATOMIC = 7;

export interface PrintOptions {
  /** The name bound to `ViewField`. */
  fieldVar?: string;
  /** The name bound to `ViewExpression`. */
  exprVar?: string;
}

/** Renders a tree as Python source. */
export const print = (node: Node, options: PrintOptions = {}): string =>
  render(node, options.fieldVar ?? "F", options.exprVar ?? "E")[0];

/** `[source, precedence]`; precedence is null for atoms. */
type Rendered = [string, number | null];

const render = (node: Node, fvar: string, evar: string): Rendered => {
  switch (node.t) {
    case "field":
      return [`${fvar}(${quote(node.path)})`, null];

    case "lit":
      return [literal(node.v, node.as), null];

    case "list":
      return [
        `[${node.items.map((item) => render(item, fvar, evar)[0]).join(", ")}]`,
        null,
      ];

    case "dict": {
      const entries = node.entries.map(
        ([key, value]) =>
          `${render(key, fvar, evar)[0]}: ${render(value, fvar, evar)[0]}`,
      );
      return [`{${entries.join(", ")}}`, null];
    }

    case "mongo":
      // Python renders raw MongoDB with its own repr, not as JSON
      return [`${evar}(${literal(node.expr)})`, null];

    case "static":
      return [`${evar}.${node.op}(${args(node, fvar, evar)})`, null];

    case "call":
      return call(node, fvar, evar);
  }
};

const call = (node: CallNode, fvar: string, evar: string): Rendered => {
  const { op } = node;

  if (op in PREFIX) {
    const [inner, precedence] = render(node.self, fvar, evar);
    return [`${PREFIX[op]}${parens(inner, precedence, ATOMIC)}`, null];
  }

  if (op in BUILTIN_CALL) {
    const rest = args(node, fvar, evar);
    const inner = render(node.self, fvar, evar)[0];
    return [`${BUILTIN_CALL[op]}(${inner}${rest ? `, ${rest}` : ""})`, null];
  }

  if (op === "__getitem__") {
    const [inner, precedence] = render(node.self, fvar, evar);
    const index = render((node.args ?? [])[0], fvar, evar)[0];
    return [`${parens(inner, precedence, ATOMIC)}[${index}]`, null];
  }

  if (op === "__call__") {
    const [inner, precedence] = render(node.self, fvar, evar);
    return [
      `${parens(inner, precedence, ATOMIC)}(${args(node, fvar, evar)})`,
      null,
    ];
  }

  const symbol = INFIX[op] ?? REFLECTED[op];
  if (symbol) {
    const precedence = PRECEDENCE[symbol];
    const other = (node.args ?? [])[0];
    // A reflected operator was written with its operands the other way round
    const [leftNode, rightNode] =
      op in INFIX ? [node.self, other] : [other, node.self];
    const [left, leftPrecedence] = render(leftNode, fvar, evar);
    const [right, rightPrecedence] = render(rightNode, fvar, evar);
    return [
      `${parens(left, leftPrecedence, precedence)} ${symbol} ${parens(
        right,
        rightPrecedence,
        precedence + 1,
      )}`,
      precedence,
    ];
  }

  const [inner, precedence] = render(node.self, fvar, evar);
  return [
    `${parens(inner, precedence, ATOMIC)}.${op}(${args(node, fvar, evar)})`,
    null,
  ];
};

const args = (
  node: CallNode | StaticNode,
  fvar: string,
  evar: string,
): string =>
  [
    ...(node.args ?? []).map((arg) => render(arg, fvar, evar)[0]),
    ...Object.entries(node.kwargs ?? {}).map(
      ([name, value]) => `${name}=${render(value, fvar, evar)[0]}`,
    ),
  ].join(", ");

const parens = (
  source: string,
  precedence: number | null,
  needed: number,
): string =>
  precedence !== null && precedence < needed ? `(${source})` : source;

/**
 * Python's `repr` for the literals that reach a view expression.
 *
 * Note the one thing JSON cannot carry: Python distinguishes `2` from `2.0`,
 * and the tree does not, so a whole-valued float renders without its trailing
 * `.0`. The expression is equivalent, and the difference vanishes on the way
 * back to MongoDB.
 */
const literal = (value: unknown, as?: "date" | "timedelta"): string => {
  if (as === "date") {
    return `datetime.utcfromtimestamp(${value} / 1000)`;
  }

  if (as === "timedelta") {
    return `timedelta(milliseconds=${value})`;
  }

  if (value === null) return "None";
  if (value === true) return "True";
  if (value === false) return "False";
  if (typeof value === "string") return quote(value);
  if (Array.isArray(value)) {
    return `[${value.map((item) => literal(item)).join(", ")}]`;
  }
  if (typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>).map(
      ([key, item]) => `${quote(key)}: ${literal(item)}`,
    );
    return `{${entries.join(", ")}}`;
  }

  return String(value);
};

/** Python's preferred string quoting. */
const quote = (value: string): string =>
  value.includes("'") && !value.includes('"')
    ? `"${value.replace(/\\/g, "\\\\")}"`
    : `'${value.replace(/\\/g, "\\\\").replace(/'/g, "\\'")}'`;
