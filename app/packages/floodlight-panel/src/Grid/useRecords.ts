import { BoundedMap } from "../host/bounded";
import usePanelMemo from "./panelMemory";

export type Records = Map<string, number>;

/**
 * Sample id → offset for the samples in memory: a best-effort cache, kept
 * well above what the bounded page sources hold, never a source of truth.
 */
export const MAX_RECORDS = 8192;

export default (clear: string): Records =>
  usePanelMemo("records", clear, () => new BoundedMap(MAX_RECORDS));
