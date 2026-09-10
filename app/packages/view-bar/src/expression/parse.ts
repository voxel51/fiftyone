/**
 * Copyright 2017-2026, Voxel51, Inc.
 *
 * Parses view expression source into a syntax tree — the other half of the
 * round trip from `./print`.
 *
 * The grammar is the subset of Python that view expressions are written in:
 * `F("path")`, `E.any([...])`, operators with Python's own precedence, method
 * chains, indexing, and literals. Parsing is what makes the editor structural
 * rather than textual: the tree is what gets applied, and the caret's position
 * in it is what decides which suggestions belong where.
 *
 * Errors carry an offset so the editor can point at the offending token
 * instead of rejecting the whole input.
 */

import type { JSONValue, Node } from "./types";

export class ExpressionSyntaxError extends Error {
  /** Offset into the source where parsing stopped. */
  readonly offset: number;

  constructor(message: string, offset: number) {
    super(message);
    this.name = "ExpressionSyntaxError";
    this.offset = offset;
  }
}

interface Token {
  kind: "name" | "number" | "string" | "op" | "end";
  value: string;
  /** Parsed value, for numbers and strings. */
  literal?: JSONValue;
  start: number;
}

const OPERATORS = [
  "**",
  "==",
  "!=",
  ">=",
  "<=",
  ">",
  "<",
  "+",
  "-",
  "*",
  "/",
  "%",
  "&",
  "|",
  "~",
  "(",
  ")",
  "[",
  "]",
  "{",
  "}",
  ",",
  ":",
  ".",
  "=",
];

/** Comparison operators, and the tree operator each maps to. */
const COMPARISONS: Record<string, string> = {
  "==": "__eq__",
  "!=": "__ne__",
  ">": "__gt__",
  ">=": "__ge__",
  "<": "__lt__",
  "<=": "__le__",
};

const ARITHMETIC: Record<string, string> = {
  "+": "__add__",
  "-": "__sub__",
  "*": "__mul__",
  "/": "__truediv__",
  "%": "__mod__",
  "**": "__pow__",
};

/** Reflected counterpart, used when the left operand is a bare literal. */
const REFLECTED: Record<string, string> = {
  __add__: "__radd__",
  __sub__: "__rsub__",
  __mul__: "__rmul__",
  __truediv__: "__rtruediv__",
  __mod__: "__rmod__",
  __and__: "__rand__",
  __or__: "__ror__",
};

/** Builtins that lower to a dunder on the expression. */
const BUILTINS: Record<string, string> = {
  abs: "__abs__",
  round: "__round__",
  len: "__len__",
  "math.ceil": "__ceil__",
  "math.floor": "__floor__",
};

const tokenize = (source: string): Token[] => {
  const tokens: Token[] = [];
  let i = 0;

  while (i < source.length) {
    const char = source[i];

    if (/\s/.test(char)) {
      i += 1;
      continue;
    }

    if (char === '"' || char === "'") {
      const start = i;
      i += 1;
      let value = "";
      while (i < source.length && source[i] !== char) {
        if (source[i] === "\\") {
          i += 1;
          if (i >= source.length) break;
        }
        value += source[i];
        i += 1;
      }
      if (i >= source.length) {
        throw new ExpressionSyntaxError("Unterminated string", start);
      }
      i += 1;
      tokens.push({ kind: "string", value, literal: value, start });
      continue;
    }

    if (/[0-9]/.test(char)) {
      const start = i;
      while (i < source.length && /[0-9._eE]/.test(source[i])) {
        i += 1;
      }
      const text = source.slice(start, i);
      const parsed = Number(text);
      if (!Number.isFinite(parsed)) {
        throw new ExpressionSyntaxError(`Not a number: ${text}`, start);
      }
      tokens.push({ kind: "number", value: text, literal: parsed, start });
      continue;
    }

    if (/[A-Za-z_]/.test(char)) {
      const start = i;
      while (i < source.length && /[A-Za-z0-9_]/.test(source[i])) {
        i += 1;
      }
      tokens.push({ kind: "name", value: source.slice(start, i), start });
      continue;
    }

    const operator = OPERATORS.find((candidate) =>
      source.startsWith(candidate, i),
    );
    if (!operator) {
      throw new ExpressionSyntaxError(`Unexpected character: ${char}`, i);
    }
    tokens.push({ kind: "op", value: operator, start: i });
    i += operator.length;
  }

  tokens.push({ kind: "end", value: "", start: source.length });
  return tokens;
};

export interface ParseOptions {
  /** The name bound to `ViewField`. */
  fieldVar?: string;
  /** The name bound to `ViewExpression`. */
  exprVar?: string;
}

/**
 * Parses source into a tree.
 *
 * @throws ExpressionSyntaxError with the offset at which parsing stopped
 */
export const parse = (source: string, options: ParseOptions = {}): Node => {
  const parser = new Parser(
    tokenize(source),
    options.fieldVar ?? "F",
    options.exprVar ?? "E",
  );
  const node = parser.expression();
  parser.expect("end");
  return node;
};

/** Parses, or returns the error rather than throwing. */
export const tryParse = (
  source: string,
  options: ParseOptions = {},
): { node: Node } | { error: ExpressionSyntaxError } => {
  try {
    return { node: parse(source, options) };
  } catch (e) {
    if (e instanceof ExpressionSyntaxError) return { error: e };
    throw e;
  }
};

/** A literal operand carries no expression, so an operator on it reflects. */
const isBareLiteral = (node: Node): boolean =>
  node.t === "lit" || node.t === "list" || node.t === "dict";

/**
 * Call and static nodes always carry `args` and `kwargs`, empty or not, because
 * that is the shape the Python encoder emits.
 */
const callNode = (
  op: string,
  self: Node,
  args: Node[] = [],
  kwargs: Record<string, Node> = {},
): Node => ({ t: "call", op, self, args, kwargs });

class Parser {
  private index = 0;

  constructor(
    private readonly tokens: Token[],
    private readonly fieldVar: string,
    private readonly exprVar: string,
  ) {}

  private peek(): Token {
    return this.tokens[this.index];
  }

  private next(): Token {
    return this.tokens[this.index++];
  }

  private at(value: string): boolean {
    const token = this.peek();
    return token.kind === "op" && token.value === value;
  }

  private eat(value: string): boolean {
    if (!this.at(value)) return false;
    this.index += 1;
    return true;
  }

  expect(kind: Token["kind"], value?: string): Token {
    const token = this.peek();
    if (token.kind !== kind || (value !== undefined && token.value !== value)) {
      throw new ExpressionSyntaxError(
        `Expected ${value ?? kind}, found ${token.value || "end of input"}`,
        token.start,
      );
    }
    return this.next();
  }

  /** Loosest binding first, matching Python. */
  expression(): Node {
    return this.comparison();
  }

  private comparison(): Node {
    let left = this.bitOr();
    for (;;) {
      const token = this.peek();
      const op = token.kind === "op" ? COMPARISONS[token.value] : undefined;
      if (!op) return left;
      this.next();
      left = this.binary(op, left, this.bitOr());
    }
  }

  private bitOr(): Node {
    let left = this.bitAnd();
    while (this.at("|")) {
      this.next();
      left = this.binary("__or__", left, this.bitAnd());
    }
    return left;
  }

  private bitAnd(): Node {
    let left = this.additive();
    while (this.at("&")) {
      this.next();
      left = this.binary("__and__", left, this.additive());
    }
    return left;
  }

  private additive(): Node {
    let left = this.multiplicative();
    for (;;) {
      const token = this.peek();
      if (token.kind !== "op" || (token.value !== "+" && token.value !== "-")) {
        return left;
      }
      this.next();
      left = this.binary(ARITHMETIC[token.value], left, this.multiplicative());
    }
  }

  private multiplicative(): Node {
    let left = this.unary();
    for (;;) {
      const token = this.peek();
      if (token.kind !== "op" || !["*", "/", "%"].includes(token.value)) {
        return left;
      }
      this.next();
      left = this.binary(ARITHMETIC[token.value], left, this.unary());
    }
  }

  private unary(): Node {
    if (this.at("~")) {
      this.next();
      return callNode("__invert__", this.unary());
    }

    // A sign belongs to the number it precedes; the tree has no negation
    if (this.at("-") || this.at("+")) {
      const token = this.next();
      const operand = this.unary();
      if (operand.t !== "lit" || typeof operand.v !== "number" || operand.as) {
        throw new ExpressionSyntaxError(
          `Unary ${token.value} takes a number`,
          token.start,
        );
      }
      return token.value === "-" ? { t: "lit", v: -operand.v } : operand;
    }

    return this.power();
  }

  private power(): Node {
    const base = this.postfix();
    if (this.at("**")) {
      this.next();
      return this.binary("__pow__", base, this.unary());
    }
    return base;
  }

  /**
   * Builds an operator node, reflecting when the left operand is a bare literal
   * — `2 - F("a")` is what Python dispatches to `F("a").__rsub__(2)`.
   */
  private binary(op: string, left: Node, right: Node): Node {
    if (isBareLiteral(left) && !isBareLiteral(right) && REFLECTED[op]) {
      return callNode(REFLECTED[op], right, [left]);
    }
    return callNode(op, left, [right]);
  }

  private postfix(): Node {
    let node = this.primary();

    for (;;) {
      if (this.eat(".")) {
        const name = this.expect("name").value;
        const { args, kwargs } = this.callArgs();
        node = callNode(name, node, args, kwargs);
        continue;
      }

      if (this.at("[")) {
        this.next();
        const index = this.expression();
        this.expect("op", "]");
        node = callNode("__getitem__", node, [index]);
        continue;
      }

      if (this.at("(")) {
        const { args, kwargs } = this.callArgs();
        node = callNode("__call__", node, args, kwargs);
        continue;
      }

      return node;
    }
  }

  private callArgs(): { args: Node[]; kwargs: Record<string, Node> } {
    this.expect("op", "(");
    const args: Node[] = [];
    const kwargs: Record<string, Node> = {};

    while (!this.at(")")) {
      const token = this.peek();
      const named =
        token.kind === "name" &&
        this.tokens[this.index + 1]?.kind === "op" &&
        this.tokens[this.index + 1].value === "=";

      if (named) {
        this.next();
        this.next();
        kwargs[token.value] = this.expression();
      } else {
        args.push(this.expression());
      }

      if (!this.eat(",")) break;
    }

    this.expect("op", ")");
    return { args, kwargs };
  }

  private primary(): Node {
    const token = this.peek();

    if (token.kind === "number" || token.kind === "string") {
      this.next();
      return { t: "lit", v: token.literal as JSONValue };
    }

    if (this.at("(")) {
      this.next();
      const node = this.expression();
      this.expect("op", ")");
      return node;
    }

    if (this.at("[")) {
      this.next();
      const items: Node[] = [];
      while (!this.at("]")) {
        items.push(this.expression());
        if (!this.eat(",")) break;
      }
      this.expect("op", "]");
      return { t: "list", items };
    }

    if (this.at("{")) {
      this.next();
      const entries: [Node, Node][] = [];
      while (!this.at("}")) {
        const key = this.expression();
        this.expect("op", ":");
        entries.push([key, this.expression()]);
        if (!this.eat(",")) break;
      }
      this.expect("op", "}");
      return { t: "dict", entries };
    }

    if (token.kind === "name") {
      return this.name();
    }

    throw new ExpressionSyntaxError(
      `Unexpected ${token.value || "end of input"}`,
      token.start,
    );
  }

  private name(): Node {
    const token = this.next();
    const { value } = token;

    if (value === "None") return { t: "lit", v: null };
    if (value === "True") return { t: "lit", v: true };
    if (value === "False") return { t: "lit", v: false };

    if (value === this.fieldVar) {
      return { t: "field", path: this.fieldPath(token.start) };
    }

    if (value === this.exprVar) {
      // `E.op(...)` is a static constructor; `E(...)` wraps raw MongoDB
      if (this.eat(".")) {
        const op = this.expect("name").value;
        const { args, kwargs } = this.callArgs();
        return { t: "static", op, args, kwargs };
      }
      const { args } = this.callArgs();
      const first = args[0];
      if (!first) {
        throw new ExpressionSyntaxError(
          `${this.exprVar}() takes an expression`,
          token.start,
        );
      }
      return { t: "mongo", expr: toJSON(first, token.start) };
    }

    if (value === "datetime" || value === "timedelta") {
      return this.temporal(value, token.start);
    }

    // `math.ceil` and friends are dotted builtins
    let name = value;
    if (name === "math" && this.at(".")) {
      this.next();
      name = `math.${this.expect("name").value}`;
    }

    const builtin = BUILTINS[name];
    if (builtin) {
      const { args } = this.callArgs();
      const target = args[0];
      if (!target) {
        throw new ExpressionSyntaxError(
          `${name}() takes an argument`,
          token.start,
        );
      }
      return callNode(builtin, target, args.slice(1));
    }

    throw new ExpressionSyntaxError(`Unknown name: ${name}`, token.start);
  }

  /**
   * The path inside `F(...)`, quoted or not.
   *
   * Python requires the quotes and {@link print} always writes them, but a
   * field path is a bare word in every other part of the App, and typing
   * `F(confidence)` is what people reach for. Accepting it here costs nothing:
   * the tree records the path either way, so what leaves the editor is quoted
   * regardless of how it was typed.
   */
  private fieldPath(start: number): string {
    this.expect("op", "(");

    const token = this.peek();
    if (token.kind === "string") {
      this.next();
      this.expect("op", ")");
      return token.literal as string;
    }

    if (token.kind === "name") {
      let path = this.next().value;
      while (this.at(".")) {
        this.next();
        path += `.${this.expect("name").value}`;
      }
      this.expect("op", ")");
      return path;
    }

    throw new ExpressionSyntaxError(
      `${this.fieldVar}() takes a field path`,
      start,
    );
  }

  /**
   * `datetime.utcfromtimestamp(<ms> / 1000)` and
   * `timedelta(milliseconds=<ms>)` — how {@link print} renders the two literals
   * JSON cannot carry natively.
   */
  private temporal(kind: string, start: number): Node {
    if (kind === "timedelta") {
      const { kwargs } = this.callArgs();
      const ms = kwargs.milliseconds;
      if (!ms || ms.t !== "lit" || typeof ms.v !== "number") {
        throw new ExpressionSyntaxError(
          "timedelta() takes milliseconds=<number>",
          start,
        );
      }
      return { t: "lit", v: ms.v, as: "timedelta" };
    }

    // `datetime(y, m, d[, h, min, s])` — how a person writes a date, and what
    // the date picker inserts. It parses to the same millisecond literal the
    // canonical `datetime.utcfromtimestamp(<ms> / 1000)` form does.
    if (this.at("(")) {
      const { args } = this.callArgs();
      const parts = args.map((arg) => {
        if (arg.t !== "lit" || typeof arg.v !== "number") {
          throw new ExpressionSyntaxError(
            "datetime() takes numbers: year, month, day[, hour, minute, second]",
            start,
          );
        }
        return arg.v;
      });
      if (parts.length < 3 || parts.length > 6) {
        throw new ExpressionSyntaxError(
          "datetime() takes year, month, day[, hour, minute, second]",
          start,
        );
      }
      const [year, month, day, hour = 0, minute = 0, second = 0] = parts;
      return {
        t: "lit",
        v: Date.UTC(year, month - 1, day, hour, minute, second),
        as: "date",
      };
    }

    this.expect("op", ".");
    const method = this.expect("name").value;
    if (method !== "utcfromtimestamp") {
      throw new ExpressionSyntaxError(`Unsupported datetime.${method}`, start);
    }
    const { args } = this.callArgs();
    const seconds = args[0];
    // print() renders `<ms> / 1000`, which parses as a division node
    if (
      seconds?.t === "call" &&
      seconds.op === "__truediv__" &&
      seconds.self.t === "lit" &&
      typeof seconds.self.v === "number"
    ) {
      return { t: "lit", v: seconds.self.v, as: "date" };
    }
    if (seconds?.t === "lit" && typeof seconds.v === "number") {
      return { t: "lit", v: seconds.v * 1000, as: "date" };
    }
    throw new ExpressionSyntaxError(
      "datetime.utcfromtimestamp() takes a number",
      start,
    );
  }
}

/** Reduces a literal-only subtree back to plain JSON, for `E({...})`. */
const toJSON = (node: Node, offset: number): JSONValue => {
  switch (node.t) {
    case "lit":
      return node.v;
    case "list":
      return node.items.map((item) => toJSON(item, offset));
    case "dict": {
      const out: Record<string, JSONValue> = {};
      for (const [key, value] of node.entries) {
        const name = toJSON(key, offset);
        if (typeof name !== "string") {
          throw new ExpressionSyntaxError("Expected a string key", offset);
        }
        out[name] = toJSON(value, offset);
      }
      return out;
    }
    default:
      throw new ExpressionSyntaxError(
        "Expected literal MongoDB, found an expression",
        offset,
      );
  }
};
