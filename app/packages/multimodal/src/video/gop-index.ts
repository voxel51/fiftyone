import type { EncodedVideoAccessUnit } from "./types";

export const VIDEO_ENCODED_ACCESS_UNIT_BYTE_CAP = 128 * 1024 * 1024;
const VIDEO_GOP_INDEX_KEYFRAME_CAP = 8_192;

interface KeyframeEntry {
  readonly configSignature: string;
  readonly epoch: number;
  readonly timeNs: bigint;
}

interface TimeRange {
  readonly endTimeNs: bigint;
  readonly startTimeNs: bigint;
}

/** Sparse keyframe/config index plus positive and negative searched coverage. */
export class VideoGopIndex {
  private readonly keyframes: KeyframeEntry[] = [];
  private readonly negativeCoverage: TimeRange[] = [];
  private readonly readCoverage: TimeRange[] = [];

  constructor(private readonly keyframeCap = VIDEO_GOP_INDEX_KEYFRAME_CAP) {}

  observe(unit: EncodedVideoAccessUnit): void {
    if (!unit.frame.keyframe) return;
    const signature = videoConfigSignature(unit);
    const insertionIndex = lowerBoundKeyframe(this.keyframes, unit.timeNs);
    if (this.keyframes[insertionIndex]?.timeNs === unit.timeNs) return;
    const inserted: KeyframeEntry = {
      configSignature: signature,
      epoch: 0,
      timeNs: unit.timeNs,
    };
    this.keyframes.splice(insertionIndex, 0, inserted);
    let retainedIndex = insertionIndex;
    if (this.keyframes.length > this.keyframeCap) {
      // Retain the bounded neighborhood around the most recently observed
      // seek position. Forward playback drops the oldest entry; a historical
      // seek drops the far future instead of immediately evicting its result.
      if (insertionIndex < this.keyframes.length / 2) {
        this.keyframes.pop();
      } else {
        this.keyframes.shift();
        retainedIndex -= 1;
      }
    }
    if (retainedIndex >= 0) this.reassignEpochsFrom(retainedIndex);
  }

  recordReadCoverage(
    startTimeNs: bigint,
    endTimeNs: bigint,
    units: readonly EncodedVideoAccessUnit[],
  ): void {
    mergeRange(this.readCoverage, { endTimeNs, startTimeNs });
    for (const unit of units) this.observe(unit);
    if (!units.some((unit) => unit.frame.keyframe)) {
      mergeRange(this.negativeCoverage, { endTimeNs, startTimeNs });
    }
  }

  keyframeTimeAtOrBefore(timeNs: bigint): bigint | null {
    return this.keyframeAtOrBefore(timeNs)?.timeNs ?? null;
  }

  sameEpoch(leftTimeNs: bigint, rightTimeNs: bigint): boolean {
    const left = this.keyframeAtOrBefore(leftTimeNs);
    const right = this.keyframeAtOrBefore(rightTimeNs);
    return Boolean(left && right && left.epoch === right.epoch);
  }

  deepestKnownKeyframeFreeStart(timeNs: bigint): bigint | null {
    let start: bigint | null = null;
    for (const range of this.negativeCoverage) {
      if (range.startTimeNs <= timeNs && timeNs <= range.endTimeNs + 1n) {
        start =
          start === null || range.startTimeNs < start
            ? range.startTimeNs
            : start;
      }
    }
    return start;
  }

  covers(startTimeNs: bigint, endTimeNs: bigint): boolean {
    return this.readCoverage.some(
      (range) =>
        range.startTimeNs <= startTimeNs && range.endTimeNs >= endTimeNs,
    );
  }

  /** Cache eviction makes prior positive/negative read claims unusable. */
  invalidateCoverage(): void {
    this.negativeCoverage.length = 0;
    this.readCoverage.length = 0;
  }

  clear(): void {
    this.keyframes.length = 0;
    this.negativeCoverage.length = 0;
    this.readCoverage.length = 0;
  }

  private keyframeAtOrBefore(timeNs: bigint): KeyframeEntry | null {
    const index = upperBoundKeyframe(this.keyframes, timeNs) - 1;
    return index >= 0 ? this.keyframes[index] : null;
  }

  /** Rebuilds only until the inserted boundary rejoins unchanged epochs. */
  private reassignEpochsFrom(startIndex: number): void {
    let previous = startIndex > 0 ? this.keyframes[startIndex - 1] : null;
    for (let index = startIndex; index < this.keyframes.length; index += 1) {
      const entry = this.keyframes[index];
      const epoch =
        previous === null
          ? 0
          : entry.configSignature === previous.configSignature
            ? previous.epoch
            : previous.epoch + 1;
      const unchanged = entry.epoch === epoch;
      const updated = unchanged ? entry : { ...entry, epoch };
      this.keyframes[index] = updated;
      previous = updated;
      if (index > startIndex && unchanged) break;
    }
  }
}

/** Byte-budgeted encoded access-unit LRU. No live VideoFrames are retained. */
export class EncodedAccessUnitCache {
  private bytes = 0;
  private readonly entries = new Map<bigint, EncodedVideoAccessUnit>();
  private readonly sortedTimes: bigint[] = [];

  constructor(
    private readonly byteCap = VIDEO_ENCODED_ACCESS_UNIT_BYTE_CAP,
    private readonly onEvict: (timeNs: bigint) => void = () => undefined,
  ) {}

  get retainedBytes(): number {
    return this.bytes;
  }

  has(timeNs: bigint): boolean {
    return this.entries.has(timeNs);
  }

  get(timeNs: bigint): EncodedVideoAccessUnit | undefined {
    const unit = this.entries.get(timeNs);
    if (unit) this.touch(timeNs, unit);
    return unit;
  }

  put(unit: EncodedVideoAccessUnit): void {
    const previous = this.entries.get(unit.timeNs);
    if (previous) {
      this.bytes -= previous.frame.bytes.byteLength;
      this.entries.delete(unit.timeNs);
    }
    if (unit.frame.bytes.byteLength > this.byteCap) {
      if (previous) {
        this.removeSortedTime(unit.timeNs);
        this.onEvict(unit.timeNs);
      }
      return;
    }
    if (!previous) {
      const index = lowerBoundTime(this.sortedTimes, unit.timeNs);
      this.sortedTimes.splice(index, 0, unit.timeNs);
    }
    this.entries.set(unit.timeNs, unit);
    this.bytes += unit.frame.bytes.byteLength;
    while (this.bytes > this.byteCap) {
      const oldest = this.entries.entries().next().value as
        | readonly [bigint, EncodedVideoAccessUnit]
        | undefined;
      if (!oldest) break;
      this.entries.delete(oldest[0]);
      this.removeSortedTime(oldest[0]);
      this.bytes -= oldest[1].frame.bytes.byteLength;
      this.onEvict(oldest[0]);
    }
  }

  putAll(units: readonly EncodedVideoAccessUnit[]): void {
    for (const unit of units) this.put(unit);
  }

  range(startTimeNs: bigint, endTimeNs: bigint): EncodedVideoAccessUnit[] {
    const units: EncodedVideoAccessUnit[] = [];
    const touchedTimes: bigint[] = [];
    let index = lowerBoundTime(this.sortedTimes, startTimeNs);
    while (index < this.sortedTimes.length) {
      const timeNs = this.sortedTimes[index];
      if (timeNs > endTimeNs) break;
      const unit = this.entries.get(timeNs);
      if (unit) {
        units.push(unit);
        touchedTimes.push(timeNs);
      }
      index += 1;
    }
    // Refresh recency without disturbing timestamp order.
    for (const timeNs of touchedTimes) {
      const unit = this.entries.get(timeNs);
      if (unit) this.touch(timeNs, unit);
    }
    return units;
  }

  rangeByDecodeTime(
    startTimeNs: bigint,
    endTimeNs: bigint,
  ): EncodedVideoAccessUnit[] {
    const units = [...this.entries.values()]
      .filter((unit) => {
        const decodeTimeNs = unit.frame.decodeTimestampNs ?? unit.timeNs;
        return decodeTimeNs >= startTimeNs && decodeTimeNs <= endTimeNs;
      })
      .sort(compareUnitDecodeTime);
    for (const unit of units) this.touch(unit.timeNs, unit);
    return units;
  }

  clear(): void {
    const clearedTimes = [...this.entries.keys()];
    this.entries.clear();
    this.sortedTimes.length = 0;
    this.bytes = 0;
    for (const timeNs of clearedTimes) this.onEvict(timeNs);
  }

  private removeSortedTime(timeNs: bigint): void {
    const index = lowerBoundTime(this.sortedTimes, timeNs);
    if (this.sortedTimes[index] === timeNs) this.sortedTimes.splice(index, 1);
  }

  private touch(timeNs: bigint, unit: EncodedVideoAccessUnit): void {
    this.entries.delete(timeNs);
    this.entries.set(timeNs, unit);
  }
}

export function uniqueSortedAccessUnits(
  units: readonly EncodedVideoAccessUnit[],
): EncodedVideoAccessUnit[] {
  const byTime = new Map<bigint, EncodedVideoAccessUnit>();
  for (const unit of units) byTime.set(unit.timeNs, unit);
  return [...byTime.values()].sort(compareUnitTime);
}

function videoConfigSignature(unit: EncodedVideoAccessUnit): string {
  if (unit.frame.codec !== "h264") return unit.frame.format;
  const { codecString = "", pps, sps } = unit.frame.h264;
  return `${codecString}:${encodeBytes(sps)}:${encodeBytes(pps)}`;
}

/** Parameter sets are tiny, so exact encoding avoids configuration aliases. */
function encodeBytes(bytes: Uint8Array | undefined): string {
  if (!bytes) return "";
  let encoded = `${bytes.byteLength}:`;
  for (const byte of bytes) {
    encoded += byte.toString(16).padStart(2, "0");
  }
  return encoded;
}

function compareUnitTime(
  left: EncodedVideoAccessUnit,
  right: EncodedVideoAccessUnit,
): number {
  return left.timeNs < right.timeNs ? -1 : left.timeNs > right.timeNs ? 1 : 0;
}

function compareUnitDecodeTime(
  left: EncodedVideoAccessUnit,
  right: EncodedVideoAccessUnit,
): number {
  const leftTimeNs = left.frame.decodeTimestampNs ?? left.timeNs;
  const rightTimeNs = right.frame.decodeTimestampNs ?? right.timeNs;
  return leftTimeNs < rightTimeNs
    ? -1
    : leftTimeNs > rightTimeNs
      ? 1
      : compareUnitTime(left, right);
}

function lowerBoundKeyframe(
  entries: readonly KeyframeEntry[],
  timeNs: bigint,
): number {
  let low = 0;
  let high = entries.length;
  while (low < high) {
    const middle = (low + high) >>> 1;
    if (entries[middle].timeNs < timeNs) low = middle + 1;
    else high = middle;
  }
  return low;
}

function upperBoundKeyframe(
  entries: readonly KeyframeEntry[],
  timeNs: bigint,
): number {
  let low = 0;
  let high = entries.length;
  while (low < high) {
    const middle = (low + high) >>> 1;
    if (entries[middle].timeNs <= timeNs) low = middle + 1;
    else high = middle;
  }
  return low;
}

function lowerBoundTime(entries: readonly bigint[], timeNs: bigint): number {
  let low = 0;
  let high = entries.length;
  while (low < high) {
    const middle = (low + high) >>> 1;
    if (entries[middle] < timeNs) low = middle + 1;
    else high = middle;
  }
  return low;
}

function mergeRange(ranges: TimeRange[], candidate: TimeRange): void {
  ranges.push(candidate);
  ranges.sort((left, right) =>
    left.startTimeNs < right.startTimeNs
      ? -1
      : left.startTimeNs > right.startTimeNs
        ? 1
        : 0,
  );
  const merged: TimeRange[] = [];
  for (const range of ranges) {
    const previous = merged.at(-1);
    if (!previous || range.startTimeNs > previous.endTimeNs + 1n) {
      merged.push(range);
      continue;
    }
    merged[merged.length - 1] = {
      startTimeNs: previous.startTimeNs,
      endTimeNs:
        range.endTimeNs > previous.endTimeNs
          ? range.endTimeNs
          : previous.endTimeNs,
    };
  }
  ranges.splice(0, ranges.length, ...merged);
}
