/**
 * Copyright 2017-2026, Voxel51, Inc.
 */

import { describe, expect, it } from "vitest";
import { resolveOverlayRemovalTarget } from "./useSyncLighterLabelStream";

const snapshot = (
  ...detections: Array<{ id: string; _id?: string }>
): { detections: Array<{ id: string; _id?: string }> } => ({ detections });

describe("resolveOverlayRemovalTarget", () => {
  it("resolves the synthetic overlay id to the underlying detection _id", () => {
    expect(
      resolveOverlayRemovalTarget(
        { id: "instance-abc" },
        snapshot({ id: "instance-abc", _id: "det-1" })
      )
    ).toBe("det-1");
  });

  it("returns null for a lifecycle removal even when the overlay is in the snapshot", () => {
    // The data-loss regression: a scene teardown / scrub-off eviction fires
    // `overlay-removed` while the playhead is still on the frame, so the
    // removed overlay IS in the current snapshot. It must NOT delete from the
    // cache — otherwise an autosave tick wipes every detection on the frame.
    expect(
      resolveOverlayRemovalTarget(
        { id: "instance-abc", lifecycle: true },
        snapshot(
          { id: "instance-abc", _id: "det-1" },
          { id: "instance-def", _id: "det-2" }
        )
      )
    ).toBeNull();
  });

  it("returns null when the removed overlay id has no detection in the snapshot", () => {
    // e.g. the draw-mode overlay evicted after minting an Instance.
    expect(
      resolveOverlayRemovalTarget(
        { id: "draft-xyz" },
        snapshot({ id: "instance-abc", _id: "det-1" })
      )
    ).toBeNull();
  });

  it("returns null when there is no snapshot", () => {
    expect(
      resolveOverlayRemovalTarget({ id: "instance-abc" }, null)
    ).toBeNull();
  });

  it("returns null when the matched detection lacks an _id", () => {
    expect(
      resolveOverlayRemovalTarget(
        { id: "instance-abc" },
        snapshot({ id: "instance-abc" })
      )
    ).toBeNull();
  });
});
