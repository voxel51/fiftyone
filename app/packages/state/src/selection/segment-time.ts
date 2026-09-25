import type { SelectionRange } from "./types";

/** Converts native, half-open bounds to elapsed time without rounding epochs. */
export function segmentTimeNs(
  range: SelectionRange,
  options: { originNs?: bigint; frameRate?: number } = {},
): { startNs: bigint; endNs: bigint } | null {
  const start = BigInt(range.start);
  const end = BigInt(range.end);
  if (range.timebase === "duration-ns") return { startNs: start, endNs: end };
  if (range.timebase === "timestamp-ns") {
    if (options.originNs === undefined) return null;
    return { startNs: start - options.originNs, endNs: end - options.originNs };
  }
  if (range.timebase === "sequence") {
    const fps = options.frameRate;
    if (!fps || !Number.isFinite(fps) || fps <= 0) return null;
    return {
      startNs: BigInt(Math.round((Number(start) / fps) * 1e9)),
      endNs: BigInt(Math.round((Number(end) / fps) * 1e9)),
    };
  }
  return null;
}
