import {
  decimateLocationTrackSegments,
  IncrementalLocationSegmentBuilder,
  isValidLocationPoint,
  unwrapLocationTrackPoint,
  type DecimatedLocationTrack,
  type LocationTrackPoint,
} from "./location-track";
import { wrapLongitude } from "../wgs84";

interface StoredLocationPoint {
  readonly claims: Set<symbol>;
  committed: boolean;
  readonly key: string;
  point: LocationTrackPoint;
}

export type LocationPointStoreAddResult =
  | "duplicate"
  | "inserted"
  | "rejected-cap";

/**
 * Per-epoch, per-stream point ownership. Exact duplicate messages share one
 * entry, while distinct fixes at the same timestamp remain ordered evidence.
 */
export class SharedLocationPointStore {
  private activeTransactionCount = 0;
  private builder = new IncrementalLocationSegmentBuilder();
  private readonly entries: StoredLocationPoint[] = [];
  private readonly entriesByKey = new Map<string, StoredLocationPoint>();
  private pointSnapshot: readonly LocationTrackPoint[] = [];
  private pointSnapshotRevision = -1;
  private rendered?: DecimatedLocationTrack;
  private renderedRevision = -1;
  private revision = 0;
  private validPointCountPrefix: number[] = [];

  lastUsed = 0;
  truncated = false;
  watermarkNs: bigint | undefined;

  addCommitted(
    point: LocationTrackPoint,
    retain = true,
  ): LocationPointStoreAddResult {
    const normalizedPoint = this.normalizeIngestPoint(point);
    const key = locationPointKey(point);
    const existing = this.entriesByKey.get(key);
    if (existing) {
      existing.committed = true;
      return "duplicate";
    }
    if (!retain) {
      this.truncated = true;
      return "rejected-cap";
    }
    this.insert({
      claims: new Set(),
      committed: true,
      key,
      point: normalizedPoint,
    });
    return "inserted";
  }

  beginTransaction(): SharedLocationPointTransaction {
    this.activeTransactionCount += 1;
    return new SharedLocationPointTransaction(this);
  }

  get hasActiveTransactions(): boolean {
    return this.activeTransactionCount > 0;
  }

  get pointCount(): number {
    return this.entries.length;
  }

  countThrough(timeNs: bigint): number {
    return upperBoundEntryTime(this.entries, timeNs);
  }

  hasPoint(point: LocationTrackPoint): boolean {
    return this.entriesByKey.has(locationPointKey(point));
  }

  get points(): readonly LocationTrackPoint[] {
    if (this.pointSnapshotRevision !== this.revision) {
      this.pointSnapshot = this.entries.map((entry) => entry.point);
      this.pointSnapshotRevision = this.revision;
    }
    return this.pointSnapshot;
  }

  get renderRevision(): number {
    return this.revision;
  }

  renderedTrack(): DecimatedLocationTrack {
    if (!this.rendered || this.renderedRevision !== this.revision) {
      this.rendered = decimateLocationTrackSegments(this.builder.snapshot());
      this.renderedRevision = this.revision;
    }
    return this.rendered;
  }

  validPointCountAt(visibleCount: number): number {
    return visibleCount === 0
      ? 0
      : (this.validPointCountPrefix[visibleCount - 1] ?? 0);
  }

  private addClaimed(
    transactionId: symbol,
    point: LocationTrackPoint,
    retain: boolean,
  ): {
    readonly entry?: StoredLocationPoint;
    readonly result: LocationPointStoreAddResult;
  } {
    const normalizedPoint = this.normalizeIngestPoint(point);
    const key = locationPointKey(point);
    const existing = this.entriesByKey.get(key);
    if (existing) {
      if (!existing.committed) existing.claims.add(transactionId);
      return { entry: existing, result: "duplicate" };
    }
    if (!retain) {
      return { result: "rejected-cap" };
    }
    const entry = {
      claims: new Set([transactionId]),
      committed: false,
      key,
      point: normalizedPoint,
    };
    this.insert(entry);
    return { entry, result: "inserted" };
  }

  private insert(entry: StoredLocationPoint): void {
    const index = upperBoundEntryTime(this.entries, entry.point.timeNs);
    this.entriesByKey.set(entry.key, entry);
    if (index === this.entries.length) {
      this.entries.push(entry);
      this.builder.append(entry.point);
      this.validPointCountPrefix.push(
        (this.validPointCountPrefix.at(-1) ?? 0) +
          (isValidLocationPoint(entry.point) ? 1 : 0),
      );
      this.watermarkNs = entry.point.timeNs;
      this.revision += 1;
      return;
    }
    this.entries.splice(index, 0, entry);
    this.rebuildDerivedState();
  }

  private normalizeIngestPoint(point: LocationTrackPoint): LocationTrackPoint {
    const insertionIndex = upperBoundEntryTime(this.entries, point.timeNs);
    let reference: LocationTrackPoint | undefined;
    for (let index = insertionIndex - 1; index >= 0; index -= 1) {
      const candidate = this.entries[index].point;
      if (isValidLocationPoint(candidate)) {
        reference = candidate;
        break;
      }
    }
    return normalizePointAgainst(point, reference);
  }

  private settleTransaction(
    transactionId: symbol,
    entries: ReadonlySet<StoredLocationPoint>,
    commit: boolean,
  ): number {
    let removed = 0;
    for (const entry of entries) {
      if (commit) entry.committed = true;
      entry.claims.delete(transactionId);
      if (!entry.committed && entry.claims.size === 0) {
        const index = this.entries.indexOf(entry);
        if (index >= 0) this.entries.splice(index, 1);
        this.entriesByKey.delete(entry.key);
        removed += 1;
      }
    }
    if (removed > 0) this.rebuildDerivedState();
    return removed;
  }

  private rebuildDerivedState(): void {
    this.builder = new IncrementalLocationSegmentBuilder();
    this.validPointCountPrefix = [];
    let validPointCount = 0;
    let reference: LocationTrackPoint | undefined;
    for (const entry of this.entries) {
      entry.point = normalizePointAgainst(entry.point, reference);
      this.builder.append(entry.point);
      if (isValidLocationPoint(entry.point)) {
        validPointCount += 1;
        reference = entry.point;
      }
      this.validPointCountPrefix.push(validPointCount);
    }
    this.watermarkNs = this.entries.at(-1)?.point.timeNs;
    this.revision += 1;
  }

  /** @internal Transaction-only entrypoint. */
  _addClaimed(
    transactionId: symbol,
    point: LocationTrackPoint,
    retain: boolean,
  ) {
    return this.addClaimed(transactionId, point, retain);
  }

  /** @internal Transaction-only entrypoint. */
  _settleTransaction(
    transactionId: symbol,
    entries: ReadonlySet<StoredLocationPoint>,
    commit: boolean,
    rejectedCap: boolean,
  ): number {
    try {
      if (commit && rejectedCap) this.truncated = true;
      return this.settleTransaction(transactionId, entries, commit);
    } finally {
      this.activeTransactionCount -= 1;
    }
  }
}

/** Atomic ownership for one fallback read slice. */
export class SharedLocationPointTransaction {
  private readonly entries = new Set<StoredLocationPoint>();
  private readonly id = Symbol("location-point-transaction");
  private rejectedCap = false;
  private settled = false;

  constructor(private readonly store: SharedLocationPointStore) {}

  add(point: LocationTrackPoint, retain = true): LocationPointStoreAddResult {
    if (this.settled) throw new Error("location point transaction is settled");
    const { entry, result } = this.store._addClaimed(this.id, point, retain);
    if (entry && !entry.committed) this.entries.add(entry);
    if (result === "rejected-cap") this.rejectedCap = true;
    return result;
  }

  commit(): void {
    if (this.settled) return;
    this.settled = true;
    this.store._settleTransaction(
      this.id,
      this.entries,
      true,
      this.rejectedCap,
    );
  }

  rollback(): number {
    if (this.settled) return 0;
    this.settled = true;
    return this.store._settleTransaction(
      this.id,
      this.entries,
      false,
      this.rejectedCap,
    );
  }
}

function upperBoundEntryTime(
  entries: readonly StoredLocationPoint[],
  timeNs: bigint,
): number {
  let low = 0;
  let high = entries.length;
  while (low < high) {
    const middle = low + Math.floor((high - low) / 2);
    if (entries[middle].point.timeNs <= timeNs) low = middle + 1;
    else high = middle;
  }
  return low;
}

function locationPointKey(point: LocationTrackPoint): string {
  return [
    point.timeNs.toString(),
    numberKey(point.latitude),
    numberKey(wrapLongitude(point.longitude)),
    numberKey(point.altitude),
    numberKey(point.accuracyM),
    numberKey(point.fixService),
    numberKey(point.fixStatus),
  ].join("\0");
}

function normalizePointAgainst(
  point: LocationTrackPoint,
  reference: LocationTrackPoint | undefined,
): LocationTrackPoint {
  return unwrapLocationTrackPoint(
    {
      ...point,
      longitude: wrapLongitude(point.longitude),
      longitudeUnwrapped: undefined,
    },
    reference,
  );
}

function numberKey(value: number | undefined): string {
  return value === undefined ? "" : Object.is(value, -0) ? "-0" : String(value);
}
