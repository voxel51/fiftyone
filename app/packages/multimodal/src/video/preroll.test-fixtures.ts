import type { EncodedVideoPrerollUnit } from "../ir";
import type { EncodedVideoAccessUnit } from "./types";

/**
 * `unit` carrying `preroll`, the payloads a decoder takes immediately before
 * its own, with any other field of its frame `frame` overrides.
 */
export function withPreroll<T extends EncodedVideoAccessUnit>(
  unit: T,
  preroll: readonly EncodedVideoPrerollUnit[],
  frame: Partial<T["frame"]> = {},
): T {
  return { ...unit, frame: { ...unit.frame, ...frame, preroll } };
}
