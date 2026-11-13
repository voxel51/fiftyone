import type { ExtendedSelectionResetParticipant } from "@fiftyone/state";
import { describe, expect, it, vi } from "vitest";
// vi.mock below is hoisted above this import, so the module registers its
// participant with the mock at load
import { selectionCountState, selectionSampleCountState } from "./state";

const registry = vi.hoisted(() => ({
  participants: [] as ExtendedSelectionResetParticipant[],
}));

vi.mock("@fiftyone/state", () => ({
  registerExtendedSelectionResetParticipant: (
    participant: ExtendedSelectionResetParticipant,
  ) => {
    registry.participants.push(participant);
    return () => undefined;
  },
  resetExtendedSelectionTransaction: vi.fn(),
}));

describe("embeddings-v2 state", () => {
  it("clears the chip counts in any reset of the App's extended selection", () => {
    // A view change resets the extended selection outside the panel; the
    // counts describing the panel's stage must go in the same commit
    expect(registry.participants).toHaveLength(1);
    const reset = vi.fn();

    registry.participants[0]({ set: vi.fn(), reset });

    expect(reset).toHaveBeenCalledWith(selectionCountState);
    expect(reset).toHaveBeenCalledWith(selectionSampleCountState);
  });
});
