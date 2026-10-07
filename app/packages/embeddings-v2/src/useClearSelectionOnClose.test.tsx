// @vitest-environment jsdom
import { act, renderHook } from "@testing-library/react";
import type { ReactNode } from "react";
import { RecoilRoot, useRecoilValue } from "recoil";
import { describe, expect, it, vi } from "vitest";
import { resetExtendedSelectionTransaction } from "@fiftyone/state";
import { selectionCountState, selectionSampleCountState } from "./state";
import { useClearSelectionOnClose } from "./useClearSelectionOnClose";

// Spaces keeps close effects in a module-level map keyed by panel id and
// runs them from the tab's close button; the mock captures the registered
// effect in its place
const registry = vi.hoisted(() => ({ effect: null as (() => void) | null }));
vi.mock("@fiftyone/spaces", () => ({
  useSetPanelCloseEffect: () => (effect: () => void) => {
    registry.effect = effect;
  },
}));
// The App's reset is tested where it lives (@fiftyone/state); this pins
// that the close effect runs it through the same transaction the pill's
// counts clear in
vi.mock("@fiftyone/state", () => ({
  resetExtendedSelectionTransaction: vi.fn(),
  // state.ts registers its counts at import
  registerExtendedSelectionResetParticipant: () => () => undefined,
}));

describe("useClearSelectionOnClose", () => {
  it("registers a close effect that clears the selection and the pill", () => {
    const wrapper = ({ children }: { children: ReactNode }) => (
      <RecoilRoot
        initializeState={({ set }) => {
          set(selectionCountState, 12);
          set(selectionSampleCountState, 3);
        }}
      >
        {children}
      </RecoilRoot>
    );
    const { result } = renderHook(
      () => {
        useClearSelectionOnClose();
        return {
          count: useRecoilValue(selectionCountState),
          sampleCount: useRecoilValue(selectionSampleCountState),
        };
      },
      { wrapper },
    );
    expect(registry.effect).not.toBeNull();
    expect(result.current).toEqual({ count: 12, sampleCount: 3 });

    act(() => registry.effect?.());

    // Every extended-selection layer, through the App's own reset
    expect(resetExtendedSelectionTransaction).toHaveBeenCalledTimes(1);
    expect(resetExtendedSelectionTransaction).toHaveBeenCalledWith(
      expect.objectContaining({
        set: expect.any(Function),
        reset: expect.any(Function),
      }),
    );
    // The pill reads these; left set, a reopened panel's tab would claim
    // a selection that no longer exists
    expect(result.current).toEqual({ count: null, sampleCount: null });
  });
});
