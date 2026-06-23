import * as jsonpatch from "fast-json-patch";

import { JSONDeltas } from "../types";

/**
 * Apply JSON-Patch deltas to a document and return the resulting document.
 *
 * The single seam over the patch library: re-baselining a local store after a
 * save folds the SAME deltas the server applied, so going through one shared
 * primitive keeps client and server interpretations identical (and lets the
 * implementation be swapped without touching callers). Pure — the input
 * document is deep-cloned, never mutated.
 */
export const applyDeltas = <T>(document: T, deltas: JSONDeltas): T =>
  jsonpatch.applyPatch(
    document,
    deltas,
    /* validate */ false,
    /* mutate */ false
  ).newDocument;
