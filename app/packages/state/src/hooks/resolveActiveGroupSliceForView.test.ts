import { describe, expect, it, vi } from "vitest";
vi.mock("recoil");
vi.mock("recoil-relay");

import type { Snapshot } from "recoil";
import { getValue, setMockAtoms } from "../../../../__mocks__/recoil";
import type { State } from "../recoil";
import resolveActiveGroupSliceForView from "./resolveActiveGroupSliceForView";

const SELECT_GROUP_SLICES = "fiftyone.core.stages.SelectGroupSlices";

const LIMIT: State.Stage = {
  _cls: "fiftyone.core.stages.Limit",
  kwargs: [["limit", 3]],
};

const snapshot = {
  getPromise: async (atom) => getValue(atom),
} as unknown as Snapshot;

describe("resolveActiveGroupSliceForView", () => {
  it("selects the active slice for grouped views", async () => {
    setMockAtoms({
      isGroup: true,
      groupSlice: "left",
      _view__setter: [LIMIT],
    });

    const { slice, updater } = await resolveActiveGroupSliceForView(snapshot);
    expect(slice).toBeNull();
    expect(updater([LIMIT])).toEqual([
      LIMIT,
      {
        _cls: SELECT_GROUP_SLICES,
        kwargs: [
          ["slices", "left"],
          ["media_type", null],
          ["flat", true],
        ],
      },
    ]);
  });

  it("makes no change when the view has a SelectGroupSlices stage", async () => {
    const stage: State.Stage = {
      _cls: SELECT_GROUP_SLICES,
      kwargs: [["slices", "left"]],
    };
    setMockAtoms({
      isGroup: true,
      groupSlice: "left",
      _view__setter: [stage],
    });

    const { slice, updater } = await resolveActiveGroupSliceForView(snapshot);
    expect(slice).toBe("left");
    expect(updater([stage])).toEqual([stage]);
  });

  it("makes no change for non-grouped datasets", async () => {
    setMockAtoms({
      isGroup: false,
      groupSlice: null,
      _view__setter: [LIMIT],
    });

    const { slice, updater } = await resolveActiveGroupSliceForView(snapshot);
    expect(slice).toBeNull();
    expect(updater([LIMIT])).toEqual([LIMIT]);
  });
});
