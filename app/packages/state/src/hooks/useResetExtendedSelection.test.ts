import { describe, expect, it, vi } from "vitest";
vi.mock("recoil");
vi.mock("recoil-relay");
vi.mock("../recoil/atoms", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../recoil/atoms")>()),
  clearExtendedSelectionMirror: vi.fn(),
}));

import {
  clearExtendedSelectionMirror,
  extendedSelection,
  extendedSelectionOverrideStage,
} from "../recoil/atoms";
import { registerExtendedSelectionResetParticipant } from "./extendedSelectionReset";
import { resetExtendedSelectionTransaction } from "./useResetExtendedSelection";

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

    expect(cb.reset).toHaveBeenCalledWith(extendedSelection);
    expect(cb.reset).toHaveBeenCalledWith(extendedSelectionOverrideStage);
    // A transaction reset never fires the atoms' onSet effects, so unless
    // the mirror clears here the next dataset fragment refetch hands the
    // stale selection right back
    expect(clearExtendedSelectionMirror).toHaveBeenCalled();
    expect(participant).toHaveBeenCalledWith(cb);
  });
});
