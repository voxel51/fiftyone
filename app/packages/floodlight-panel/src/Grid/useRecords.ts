import { BoundedMap } from "../host/bounded";
import usePanelMemo from "./panelMemory";

export type Records = Map<string, number>;

/**
 * Sample id → offset for the samples in memory: a best-effort cache, kept
 * well above what the bounded page sources hold, never a source of truth.
 */
export const MAX_RECORDS = 8192;

const useRecords = (clear: string): Records =>
  usePanelMemo("records", clear, () => new BoundedMap(MAX_RECORDS));

/** Sample id → place on the order's rail, bounded like the records. */
export const useFractions = (clear: string): Records =>
  usePanelMemo("fractions", clear, () => new BoundedMap(MAX_RECORDS));

export default useRecords;
