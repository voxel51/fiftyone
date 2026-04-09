import { describe, expect, it } from "vitest";
import { createInitialSnapshot, createSnapshot } from "./TimeSnapshot";

describe("createSnapshot", () => {
  it("creates a snapshot with the given values", () => {
    const snap = createSnapshot("test-timeline", 5, 5.5);
    expect(snap.timeline).toBe("test-timeline");
    expect(snap.timeInt).toBe(5);
    expect(snap.timeReal).toBe(5.5);
    expect(snap.frameId).toBeGreaterThan(0);
  });

  it("returns a frozen object", () => {
    const snap = createSnapshot("tl", 1, 1);
    expect(Object.isFrozen(snap)).toBe(true);
  });

  it("generates monotonically increasing frameIds", () => {
    const snap1 = createSnapshot("tl", 1, 1);
    const snap2 = createSnapshot("tl", 2, 2);
    const snap3 = createSnapshot("tl", 3, 3);
    expect(snap2.frameId).toBeGreaterThan(snap1.frameId);
    expect(snap3.frameId).toBeGreaterThan(snap2.frameId);
  });

  it("increments frameId by exactly 1 per call", () => {
    const snap1 = createSnapshot("tl", 1, 1);
    const snap2 = createSnapshot("tl", 2, 2);
    expect(snap2.frameId - snap1.frameId).toBe(1);
  });

  it("assigns unique frameIds across different timelines", () => {
    const snapA = createSnapshot("timeline-a", 1, 1);
    const snapB = createSnapshot("timeline-b", 1, 1);
    expect(snapB.frameId).not.toBe(snapA.frameId);
  });
});

describe("createInitialSnapshot", () => {
  it("creates a snapshot where timeInt and timeReal equal startTime", () => {
    const snap = createInitialSnapshot("my-timeline", 10);
    expect(snap.timeline).toBe("my-timeline");
    expect(snap.timeInt).toBe(10);
    expect(snap.timeReal).toBe(10);
  });

  it("returns a frozen object", () => {
    const snap = createInitialSnapshot("tl", 1);
    expect(Object.isFrozen(snap)).toBe(true);
  });

  it("generates a monotonically increasing frameId", () => {
    const snap1 = createInitialSnapshot("tl", 1);
    const snap2 = createInitialSnapshot("tl", 1);
    expect(snap2.frameId).toBeGreaterThan(snap1.frameId);
  });
});
