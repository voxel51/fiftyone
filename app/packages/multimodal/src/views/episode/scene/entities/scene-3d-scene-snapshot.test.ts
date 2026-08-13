import { describe, expect, it } from "vitest";
import {
  selectScene3dSnapshot,
  type HeldScene3dSnapshot,
} from "./scene-3d-scene-snapshot";

const EMPTY = "empty";
const READY = "ready";
const KEY = "source:streams:frame";
const GRACE_MS = 2_000;

describe("selectScene3dSnapshot", () => {
  it("commits a ready scene", () => {
    const selection = select({ current: READY, readiness: "ready" });

    expect(selection.snapshot).toBe(READY);
    expect(selection.nextHeld).toMatchObject({
      definitiveMissingSinceMs: null,
      key: KEY,
      retainable: true,
      snapshot: READY,
    });
    expect(selection.heldReason).toBeNull();
  });

  it("holds the last valid scene while placement is pending", () => {
    const held = readyHeld();
    const selection = select({ held, readiness: "pending" });

    expect(selection.snapshot).toBe(READY);
    expect(selection.nextHeld?.snapshot).toBe(READY);
    expect(selection.heldReason).toBe("pending");
  });

  it("holds source-backed definitive-missing placement for a bounded grace", () => {
    const first = select({ held: readyHeld(), nowMs: 10_000 });
    expect(first.snapshot).toBe(READY);
    expect(first.graceRemainingMs).toBe(GRACE_MS);

    const second = select({ held: first.nextHeld, nowMs: 11_999 });
    expect(second.snapshot).toBe(READY);
    expect(second.graceRemainingMs).toBe(1);
    expect(second.heldReason).toBe("definitiveMissing");
  });

  it("commits the missing scene when the grace expires", () => {
    const first = select({ held: readyHeld(), nowMs: 10_000 });
    const expired = select({ held: first.nextHeld, nowMs: 12_000 });

    expect(expired.snapshot).toBe(EMPTY);
    expect(expired.nextHeld?.retainable).toBe(false);
    expect(expired.heldReason).toBeNull();
  });

  it("commits missing immediately when source data disappears", () => {
    const selection = select({
      hasSourceData: false,
      held: readyHeld(),
      nowMs: 10_000,
    });

    expect(selection.snapshot).toBe(EMPTY);
    expect(selection.heldReason).toBeNull();
  });

  it("does not retain a scene across semantic source changes", () => {
    const selection = select({
      held: readyHeld(),
      key: "different-source",
      readiness: "pending",
    });

    expect(selection.snapshot).toBe(EMPTY);
    expect(selection.nextHeld).toBeNull();
  });

  it("resets the definitive-missing clock after placement recovers", () => {
    const missing = select({ held: readyHeld(), nowMs: 10_000 });
    const recovered = select({
      current: "recovered",
      held: missing.nextHeld,
      nowMs: 11_000,
      readiness: "ready",
    });
    const missingAgain = select({ held: recovered.nextHeld, nowMs: 50_000 });

    expect(missingAgain.snapshot).toBe("recovered");
    expect(missingAgain.graceRemainingMs).toBe(GRACE_MS);
  });
});

function readyHeld(): HeldScene3dSnapshot<string> {
  return {
    definitiveMissingSinceMs: null,
    key: KEY,
    retainable: true,
    snapshot: READY,
  };
}

function select({
  current = EMPTY,
  hasSourceData = true,
  held = null,
  key = KEY,
  nowMs = 0,
  readiness = "definitiveMissing",
}: {
  readonly current?: string;
  readonly hasSourceData?: boolean;
  readonly held?: HeldScene3dSnapshot<string> | null;
  readonly key?: string;
  readonly nowMs?: number;
  readonly readiness?: "ready" | "pending" | "definitiveMissing";
}) {
  return selectScene3dSnapshot({
    current,
    currentRetainable: current !== EMPTY,
    definitiveMissingGraceMs: GRACE_MS,
    empty: EMPTY,
    hasSourceData,
    held,
    key,
    nowMs,
    readiness,
  });
}
