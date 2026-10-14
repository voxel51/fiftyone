/**
 * Copyright 2017-2026, Voxel51, Inc.
 *
 * Moves an expression between the source the user edits and the value the
 * server receives.
 *
 * A stage parameter holding an expression carries lowered MongoDB, which cannot
 * be turned back into `F(...)`. An envelope can, and `ViewStage._from_dict`
 * accepts one in place of a parameter's value, so the bar sends that instead —
 * the server decodes it to a real `ViewExpression` and lowers it itself.
 */

import { tryParse } from "../expression/parse";
import { print } from "../expression/print";
import { AST_KEY, AST_VERSION, isEnvelope } from "../expression/types";
import type { Envelope, Node } from "../expression/types";

export { isEnvelope };

export const toEnvelope = (node: Node): Envelope => ({
  [AST_KEY]: { version: AST_VERSION, node },
});

/**
 * The Python to show for a parameter's current value: an envelope prints back
 * to the source it was built from, and anything else — raw MongoDB from a view
 * this build did not author — has no source to show.
 */
export const sourceOf = (value: unknown): string | null => {
  if (typeof value === "string") return value;

  if (isEnvelope(value)) {
    const { version, node } = value[AST_KEY];
    // A newer tree may use syntax this build cannot print
    if (version > AST_VERSION) return null;
    return print(node);
  }

  return null;
};

export type SourceResult =
  | { status: "empty" }
  | { status: "ok"; envelope: Envelope }
  | { status: "error"; message: string; offset: number };

/** What to send for a parameter being edited as Python. */
export const fromSource = (source: string): SourceResult => {
  if (!source.trim()) return { status: "empty" };

  const parsed = tryParse(source);
  if ("error" in parsed) {
    return {
      status: "error",
      message: parsed.error.message,
      offset: parsed.error.offset,
    };
  }

  return { status: "ok", envelope: toEnvelope(parsed.node) };
};
