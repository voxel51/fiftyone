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

import {
  clearExtendedSelectionMirror,
  extendedSelection,
  extendedSelectionOverrideStage,
} from "../recoil/atoms";
import { registerExtendedSelectionResetParticipant } from "./extendedSelectionReset";
import {
  publishExtendedSelection,
  resetExtendedSelectionTransaction,
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

describe("publishExtendedSelection", () => {
  it("clears the previous selection and its artifacts before writing the new one", () => {
    const cb = { set: vi.fn(), reset: vi.fn() };
    const participant = vi.fn();
    const unregister = registerExtendedSelectionResetParticipant(participant);
    const stage = { "fiftyone.core.stages.Select": { sample_ids: ["a"] } };
    const decorate = vi.fn();

    try {
      publishExtendedSelection(cb, stage, decorate);
    } finally {
      unregister();
    }

    expect(cb.reset).toHaveBeenCalledWith(extendedSelection);
    expect(cb.set).toHaveBeenCalledWith(extendedSelectionOverrideStage, stage);
    const order = (fn: { mock: { invocationCallOrder: number[] } }) =>
      fn.mock.invocationCallOrder[0];
    expect(order(cb.reset)).toBeLessThan(order(cb.set));
    expect(order(participant)).toBeLessThan(order(cb.set));
    expect(order(cb.set)).toBeLessThan(order(decorate));
    // Joining the publish's own commit
    expect(participant).toHaveBeenCalledWith(cb);
    expect(decorate).toHaveBeenCalledWith(cb);
  });
});
