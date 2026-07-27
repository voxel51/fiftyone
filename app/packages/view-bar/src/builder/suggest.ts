/**
 * Copyright 2017-2026, Voxel51, Inc.
 *
 * What to offer at the caret, and why.
 *
 * The editor is textual, so the caret is an offset rather than a node. Reading
 * context from the text directly — the expression to the left of a trailing
 * `.`, the call whose parentheses are still open — means a half-typed
 * expression still yields good suggestions, which parsing the whole source
 * cannot do because a half-typed expression does not parse.
 *
 * Operators that do not apply are ranked last rather than hidden, carrying the
 * reason they do not. Omitting them silently only reads to someone who already
 * knows the type system.
 */

import type { Node } from "../expression/types";
import { tryParse } from "../expression/parse";
import type { Kind, Operator } from "./catalog";

/** Where the caret sits, as much as the text can say. */
export interface CaretContext {
  /**
   * The expression the caret would apply an operator to: what precedes a
   * trailing `.`. Absent when the caret is not in a member position.
   */
  receiver?: Node;
  /** Identifier characters already typed after the `.`, used to filter. */
  prefix: string;
  /** The operator whose argument list the caret sits in, if any. */
  openCall?: { op: string; argIndex: number; frame?: Frame };
  /**
   * The caret is inside the string a field path is written in — `F("conf‸")`.
   * A field name is the first thing anyone types, so it is also the first thing
   * that has to be completable.
   */
  field?: { typed: string; start: number };
}

const IDENT = /[A-Za-z0-9_]/;

interface Frame {
  start: number;
  commas: number;
}

interface Scan {
  stack: Frame[];
  /** Where the string the caret sits in opened, if it is in one. */
  stringStart: number | null;
}

/**
 * Bracket depth and string state at `offset`.
 *
 * Commas only count as argument separators at the depth of their own frame, so
 * a list literal or a nested call does not shift the argument index.
 */
const scan = (source: string, offset: number): Scan => {
  const stack: Frame[] = [];
  let quote: string | null = null;
  let stringStart: number | null = null;

  for (let i = 0; i < offset; i++) {
    const char = source[i];

    if (quote) {
      if (char === "\\") i++;
      else if (char === quote) {
        quote = null;
        stringStart = null;
      }
      continue;
    }

    if (char === '"' || char === "'") {
      quote = char;
      stringStart = i + 1;
    } else if (char === "(" || char === "[" || char === "{") {
      stack.push({ start: i, commas: 0 });
    } else if (char === ")" || char === "]" || char === "}") {
      stack.pop();
    } else if (char === "," && stack.length) {
      stack[stack.length - 1].commas += 1;
    }
  }

  return { stack, stringStart };
};

/** The identifier immediately preceding a `(`, i.e. what is being called. */
const calleeBefore = (source: string, paren: number): string => {
  let end = paren;
  while (end > 0 && IDENT.test(source[end - 1])) end--;
  return source.slice(end, paren);
};

const openCallAt = (
  source: string,
  stack: Frame[],
): { op: string; argIndex: number; frame: Frame } | undefined => {
  for (let depth = stack.length - 1; depth >= 0; depth--) {
    const frame = stack[depth];
    if (source[frame.start] !== "(") continue;

    const op = calleeBefore(source, frame.start);
    if (op) return { op, argIndex: frame.commas, frame };
  }

  return undefined;
};

export interface ContextOptions {
  /** The name bound to `ViewField`, matching the parser's own option. */
  fieldVar?: string;
}

/** Reads as much context as the text at `offset` supports. */
export const caretContext = (
  source: string,
  offset: number,
  options: ContextOptions = {},
): CaretContext => {
  const fieldVar = options.fieldVar ?? "F";
  const { stack, stringStart } = scan(source, offset);
  const openCall = openCallAt(source, stack);

  // Inside `F("…")` the caret is naming a field, not calling an operator
  if (stringStart !== null) {
    const frame = stack[stack.length - 1];
    const callee =
      frame && source[frame.start] === "("
        ? calleeBefore(source, frame.start)
        : "";

    if (callee === fieldVar) {
      return {
        prefix: "",
        openCall,
        field: {
          typed: source.slice(stringStart, offset),
          start: stringStart,
        },
      };
    }

    // Some other string literal — nothing to suggest into it
    return { prefix: "", openCall };
  }

  // `F(conf` — the quotes are optional in the editor, so a bare path inside
  // `F(` is being typed just as much as a quoted one is. The slice is anchored
  // to the `F(` frame itself: the top of the stack may be a bracket inside it,
  // and completing from there would splice the path into the wrong offset
  if (openCall?.op === fieldVar && openCall.frame === stack[stack.length - 1]) {
    const { frame } = openCall;
    const typed = source.slice(frame.start + 1, offset);

    if (/^[A-Za-z0-9_.]*$/.test(typed)) {
      return {
        prefix: "",
        openCall,
        field: { typed, start: frame.start + 1 },
      };
    }
  }

  let start = offset;
  while (start > 0 && IDENT.test(source[start - 1])) start--;
  const prefix = source.slice(start, offset);

  if (source[start - 1] !== ".") {
    return { prefix, openCall };
  }

  // Everything left of the dot is the target the operator would apply to
  const parsed = tryParse(source.slice(0, start - 1));
  if ("error" in parsed) {
    return { prefix, openCall };
  }

  return { receiver: parsed.node, prefix, openCall };
};

/**
 * Field paths for what has been typed so far, prefix matches first so the
 * shallowest sensible completion leads.
 */
export const suggestFields = (typed: string, paths: string[]): string[] => {
  const needle = typed.toLowerCase();
  if (!needle) return [...paths].sort();

  return paths
    .filter((path) => path.toLowerCase().includes(needle))
    .sort((a, b) => {
      const aStarts = a.toLowerCase().startsWith(needle);
      const bStarts = b.toLowerCase().startsWith(needle);
      if (aStarts !== bStarts) return aStarts ? -1 : 1;
      if (a.length !== b.length) return a.length - b.length;
      return a.localeCompare(b);
    });
};

/**
 * The kind a node evaluates to.
 *
 * `fieldKind` resolves a field path against the dataset's schema, which the
 * server describes per `ftype`; an unknown path is ANY rather than an error,
 * because a path being typed is not yet wrong.
 */
export const kindOf = (
  node: Node,
  operators: Operator[],
  fieldKind: (path: string) => Kind | undefined,
): Kind => {
  switch (node.t) {
    case "field":
      return fieldKind(node.path) ?? "ANY";
    case "lit": {
      if (node.as === "date") return "DATE";
      if (typeof node.v === "number") return "NUMBER";
      if (typeof node.v === "string") return "STRING";
      if (typeof node.v === "boolean") return "BOOLEAN";
      if (Array.isArray(node.v)) return "ARRAY";
      return "ANY";
    }
    case "list":
      return "ARRAY";
    case "dict":
      return "OBJECT";
    case "call":
    case "static": {
      const operator = operators.find((o) => o.name === node.op);
      return operator?.returns ?? "ANY";
    }
    default:
      return "ANY";
  }
};

export interface Suggestion {
  operator: Operator;
  /** Whether it applies to the value at the caret. */
  applicable: boolean;
  /** Why it does not, when it does not. */
  reason?: string;
}

/** ANY applies to everything, in both directions. */
const kindsMatch = (self: Kind, target: Kind): boolean =>
  self === "ANY" || target === "ANY" || self === target;

/**
 * Operators for a value of `kind`, applicable ones first, each ranked by how
 * well it matches: an exact kind match outranks one that merely accepts ANY,
 * and a name starting with what has been typed outranks one merely containing
 * it.
 */
export const suggestOperators = (
  kind: Kind,
  prefix: string,
  operators: Operator[],
): Suggestion[] => {
  const typed = prefix.toLowerCase();

  const matching = operators.filter(
    (operator) => !typed || operator.display.toLowerCase().includes(typed),
  );

  const score = (operator: Operator): number => {
    let rank = 0;
    if (operator.selfKind === kind) rank -= 2;
    else if (kindsMatch(operator.selfKind, kind)) rank -= 1;
    if (typed && operator.display.toLowerCase().startsWith(typed)) rank -= 1;
    return rank;
  };

  return matching
    .map((operator) => {
      const applicable = kindsMatch(operator.selfKind, kind);
      return {
        operator,
        applicable,
        reason: applicable
          ? undefined
          : `${operator.display} needs ${operator.selfKind}, this is ${kind}`,
      };
    })
    .sort((a, b) => {
      if (a.applicable !== b.applicable) return a.applicable ? -1 : 1;
      const byScore = score(a.operator) - score(b.operator);
      if (byScore) return byScore;
      return a.operator.display.localeCompare(b.operator.display);
    });
};

/**
 * The signature to show for the call the caret is inside: the display form,
 * which argument is active, and the kind that argument wants.
 */
export interface Signature {
  operator: Operator;
  argIndex: number;
  argKind: Kind;
}

export const signatureAt = (
  context: CaretContext,
  operators: Operator[],
): Signature | undefined => {
  if (!context.openCall) return undefined;

  const operator = operators.find(
    (o) =>
      o.name === context.openCall?.op || o.display === context.openCall?.op,
  );
  if (!operator) return undefined;

  const { argIndex } = context.openCall;
  const beyondArity = operator.maxArgs !== null && argIndex >= operator.maxArgs;

  return {
    operator,
    argIndex,
    argKind: beyondArity ? "ANY" : (operator.argKinds[argIndex] ?? "ANY"),
  };
};

/**
 * Splices a chosen field path into the source, closing the `F(...)` call it
 * was typed in.
 *
 * Completion happens mid-call — `F("l` or `F(l` — and leaving the caret
 * inside the parentheses means the next keystroke is still part of the path:
 * typing `.` offers deeper fields, never operators. Closing the quote and the
 * call is what hands the caret to operator territory.
 */
export const completeField = (
  source: string,
  field: { typed: string; start: number },
  path: string,
): { source: string; offset: number } => {
  const { start, typed } = field;
  const quote = source[start - 1];
  const quoted = quote === '"' || quote === "'";

  // Whatever already follows the typed path is kept; the quote and paren are
  // consumed from it when present and written when not
  let rest = source.slice(start + typed.length);
  let closer = "";

  if (quoted) {
    if (rest.startsWith(quote)) rest = rest.slice(1);
    closer += quote;
  }
  if (rest.startsWith(")")) rest = rest.slice(1);
  closer += ")";

  const head = source.slice(0, start) + path + closer;
  return { source: head + rest, offset: head.length };
};
