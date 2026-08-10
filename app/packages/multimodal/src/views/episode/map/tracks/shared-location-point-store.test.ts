import { describe, expect, it } from "vitest";

import type { LocationTrackPoint } from "./location-track";
import { SharedLocationPointStore } from "./shared-location-point-store";

function point(
  timeNs: bigint,
  overrides: Partial<LocationTrackPoint> = {},
): LocationTrackPoint {
  return {
    latitude: 37 + Number(timeNs) * 0.001,
    longitude: -122 - Number(timeNs) * 0.001,
    timeNs,
    ...overrides,
  };
}

describe("SharedLocationPointStore", () => {
  it("deduplicates exact points but retains distinct duplicate timestamps", () => {
    const store = new SharedLocationPointStore();
    const first = point(2n);

    expect(store.addCommitted(first)).toBe("inserted");
    expect(store.addCommitted({ ...first })).toBe("duplicate");
    expect(store.addCommitted(point(2n, { latitude: 45 }))).toBe("inserted");
    expect(store.addCommitted(point(1n))).toBe("inserted");

    expect(store.points.map((value) => value.timeNs)).toEqual([1n, 2n, 2n]);
    expect(store.points.map((value) => value.latitude)).toEqual([
      37.001, 37.002, 45,
    ]);
    expect(store.watermarkNs).toBe(2n);
  });

  it("rejects new points at capacity without rejecting known duplicates", () => {
    const store = new SharedLocationPointStore();
    const first = point(1n);
    store.addCommitted(first);

    expect(store.addCommitted({ ...first }, false)).toBe("duplicate");
    expect(store.addCommitted(point(2n), false)).toBe("rejected-cap");
    expect(store.points).toMatchObject([first]);
    expect(store.truncated).toBe(true);
  });

  it("rolls back only uncommitted claims and preserves cross-read commits", () => {
    const store = new SharedLocationPointStore();
    const abandoned = store.beginTransaction();
    const committed = store.beginTransaction();
    const shared = point(1n);
    abandoned.add(shared);
    committed.add({ ...shared });
    committed.commit();

    expect(abandoned.rollback()).toBe(0);
    expect(store.points).toMatchObject([shared]);

    const isolated = store.beginTransaction();
    isolated.add(point(2n));
    expect(isolated.rollback()).toBe(1);
    expect(store.points).toMatchObject([shared]);
  });

  it("rebuilds no-fix segmentation deterministically after late inserts", () => {
    const store = new SharedLocationPointStore();
    store.addCommitted(point(1n));
    store.addCommitted(point(3n));
    store.addCommitted(point(2n, { fixStatus: -1 }));

    expect(
      store
        .renderedTrack()
        .segments.map((segment) => segment.points.map((value) => value.timeNs)),
    ).toEqual([[1n], [3n]]);
    expect(store.validPointCountAt(3)).toBe(2);
  });

  it("unwraps seam crossings against the admitted stream tail", () => {
    const store = new SharedLocationPointStore();
    store.addCommitted(point(1n, { longitude: 179 }));
    store.addCommitted(point(2n, { longitude: -179 }));
    store.addCommitted(point(3n, { longitude: -178 }));

    expect(store.points.map((value) => value.longitude)).toEqual([
      179, 181, 182,
    ]);
    expect(
      store.renderedTrack().segments[0].points.map((value) => value.longitude),
    ).toEqual([179, 181, 182]);
  });
});
