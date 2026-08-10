import {
  decimateLocationTrackSegments,
  IncrementalLocationSegmentBuilder,
  isValidLocationPoint,
  type DecimatedLocationTrack,
  type LocationTrackPoint,
} from "./location-track";

interface StoredLocationPoint {
  readonly claims: Set<symbol>;
  committed: boolean;
  readonly key: string;
  readonly point: LocationTrackPoint;
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
    this.insert({ claims: new Set(), committed: true, key, point });
    return "inserted";
  }

  beginTransaction(): SharedLocationPointTransaction {
    return new SharedLocationPointTransaction(this);
  }

  get pointCount(): number {
    return this.entries.length;
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
    const key = locationPointKey(point);
    const existing = this.entriesByKey.get(key);
    if (existing) {
      if (!existing.committed) existing.claims.add(transactionId);
      return { entry: existing, result: "duplicate" };
    }
    if (!retain) {
      this.truncated = true;
      return { result: "rejected-cap" };
    }
    const entry = {
      claims: new Set([transactionId]),
      committed: false,
      key,
      point,
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
    for (const entry of this.entries) {
      this.builder.append(entry.point);
      if (isValidLocationPoint(entry.point)) validPointCount += 1;
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
  ): number {
    return this.settleTransaction(transactionId, entries, commit);
  }
}

/** Atomic ownership for one fallback read slice. */
export class SharedLocationPointTransaction {
  private readonly entries = new Set<StoredLocationPoint>();
  private readonly id = Symbol("location-point-transaction");
  private settled = false;

  constructor(private readonly store: SharedLocationPointStore) {}

  add(point: LocationTrackPoint, retain = true): LocationPointStoreAddResult {
    if (this.settled) throw new Error("location point transaction is settled");
    const { entry, result } = this.store._addClaimed(this.id, point, retain);
    if (entry && !entry.committed) this.entries.add(entry);
    return result;
  }

  commit(): void {
    if (this.settled) return;
    this.settled = true;
    this.store._settleTransaction(this.id, this.entries, true);
  }

  rollback(): number {
    if (this.settled) return 0;
    this.settled = true;
    return this.store._settleTransaction(this.id, this.entries, false);
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
    numberKey(point.longitude),
    numberKey(point.altitude),
    numberKey(point.accuracyM),
    numberKey(point.fixService),
    numberKey(point.fixStatus),
  ].join("\0");
}

function numberKey(value: number | undefined): string {
  return value === undefined ? "" : Object.is(value, -0) ? "-0" : String(value);
}
