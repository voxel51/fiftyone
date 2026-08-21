import { describe, expect, it } from "vitest";
import {
  createHoverIndexTracker,
  resolveLabelByInstanceId,
} from "./cuboid-instance-interaction";

describe("resolveLabelByInstanceId", () => {
  const labelsByIndex = ["label-a", "label-b", "label-c"];

  it("resolves the label at the given instance index", () => {
    expect(resolveLabelByInstanceId(labelsByIndex, 1)).toBe("label-b");
  });

  it("returns null when instanceId is undefined (no instance under the pointer)", () => {
    expect(resolveLabelByInstanceId(labelsByIndex, undefined)).toBeNull();
  });

  it("returns null for an out-of-range index instead of throwing", () => {
    expect(resolveLabelByInstanceId(labelsByIndex, 99)).toBeNull();
  });
});

describe("createHoverIndexTracker", () => {
  it("returns the last hovered index on consume", () => {
    const tracker = createHoverIndexTracker();
    tracker.setHovered(2);
    expect(tracker.consumeHovered()).toBe(2);
  });

  it("forgets the index after it's consumed once", () => {
    const tracker = createHoverIndexTracker();
    tracker.setHovered(2);
    tracker.consumeHovered();
    expect(tracker.consumeHovered()).toBeNull();
  });

  it("starts with no hovered index", () => {
    const tracker = createHoverIndexTracker();
    expect(tracker.consumeHovered()).toBeNull();
  });

  it("reflects the most recent setHovered call, overwriting any earlier index", () => {
    const tracker = createHoverIndexTracker();
    tracker.setHovered(0);
    tracker.setHovered(5);
    expect(tracker.consumeHovered()).toBe(5);
  });

  it("clears the tracked index when set to null (e.g. a guarded pointer-over that bails early)", () => {
    const tracker = createHoverIndexTracker();
    tracker.setHovered(3);
    tracker.setHovered(null);
    expect(tracker.consumeHovered()).toBeNull();
  });
});

describe("resolveLabelByInstanceId + createHoverIndexTracker together", () => {
  // Mirrors CuboidInstances' actual pointer-out path: r3f doesn't guarantee
  // `instanceId` on pointer-out, so the outgoing label must come from the
  // index recorded on the prior pointer-over, not from the pointer-out event.
  it("resolves the correct label on pointer-out from the index recorded on pointer-over", () => {
    const labelsByIndex = ["label-a", "label-b", "label-c"];
    const tracker = createHoverIndexTracker();

    // pointer-over instance 2
    tracker.setHovered(2);

    // pointer-out arrives with no instanceId of its own
    const outIndex = tracker.consumeHovered();
    const outLabel = resolveLabelByInstanceId(
      labelsByIndex,
      outIndex ?? undefined,
    );

    expect(outLabel).toBe("label-c");
  });

  it("resolves null on pointer-out when nothing was ever hovered", () => {
    const labelsByIndex = ["label-a", "label-b", "label-c"];
    const tracker = createHoverIndexTracker();

    const outIndex = tracker.consumeHovered();
    const outLabel = resolveLabelByInstanceId(
      labelsByIndex,
      outIndex ?? undefined,
    );

    expect(outLabel).toBeNull();
  });
});
