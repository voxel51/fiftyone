import { describe, expect, it, vi } from "vitest";
// An explicit factory, NOT importOriginal: the real atoms module reaches this
// hook again through the package barrel, and loading it here instantiates the
// hook against the unmocked module before the mock can take effect
vi.mock("../recoil/atoms", () => ({
  clearExtendedSelectionMirror: vi.fn(),
  // Distinct sentinels, so the two reset assertions below cannot both match
  // one call
  extendedSelection: { key: "extendedSelection" },
  extendedSelectionOverrideStage: { key: "extendedSelectionOverrideStage" },
}));

// Hands the hook's callback the test's own set/reset, so its writes can be
// read back in order
const recoilCb = vi.hoisted(() => ({ set: vi.fn(), reset: vi.fn() }));
vi.mock("recoil", () => ({
  useRecoilCallback: (factory: (cb: unknown) => unknown) => factory(recoilCb),
  useRecoilTransaction_UNSTABLE: vi.fn(),
}));

import {
  clearExtendedSelectionMirror,
  extendedSelection,
  extendedSelectionOverrideStage,
} from "../recoil/atoms";
import { registerExtendedSelectionResetParticipant } from "./extendedSelectionReset";
import {
  resetExtendedSelectionTransaction,
  usePublishExtendedSelection,
} from "./useResetExtendedSelection";

describe("resetExtendedSelectionTransaction", () => {
  it("clears the atoms, their fragment-read mirror, and registered artifacts together", () => {
    const cb = { set: vi.fn(), reset: vi.fn() };
    const participant = vi.fn();
    const unregister = registerExtendedSelectionResetParticipant(participant);

    try {
      resetExtendedSelectionTransaction(cb);
    } finally {
      unregister();
    }

    expect(cb.reset).toHaveBeenCalledTimes(2);
    expect(cb.reset).toHaveBeenCalledWith(extendedSelection);
    expect(cb.reset).toHaveBeenCalledWith(extendedSelectionOverrideStage);
    // A transaction reset never fires the atoms' onSet effects, so unless
    // the mirror clears here the next dataset fragment refetch hands the
    // stale selection right back
    expect(clearExtendedSelectionMirror).toHaveBeenCalled();
    expect(participant).toHaveBeenCalledWith(cb);
  });
});

describe("usePublishExtendedSelection", () => {
  it("clears the previous selection and its artifacts before writing the new one", () => {
    const participant = vi.fn();
    const unregister = registerExtendedSelectionResetParticipant(participant);
    const stage = { "fiftyone.core.stages.Select": { sample_ids: ["a"] } };
    const decorate = vi.fn();

    try {
      usePublishExtendedSelection()(stage, decorate);
    } finally {
      unregister();
    }

    expect(recoilCb.reset).toHaveBeenCalledWith(extendedSelection);
    expect(recoilCb.set).toHaveBeenCalledWith(
      extendedSelectionOverrideStage,
      stage,
    );
    const order = (fn: { mock: { invocationCallOrder: number[] } }) =>
      fn.mock.invocationCallOrder[0];
    expect(order(recoilCb.reset)).toBeLessThan(order(recoilCb.set));
    expect(order(participant)).toBeLessThan(order(recoilCb.set));
    expect(order(recoilCb.set)).toBeLessThan(order(decorate));
  });
});
