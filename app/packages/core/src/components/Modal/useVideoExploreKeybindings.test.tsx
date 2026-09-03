/**
 * Copyright 2017-2026, Voxel51, Inc.
 */

/**
 * The Escape ladder's WIRING, as distinct from `KeyManager`'s dispatch of it
 * (`commands/src/keys/manager.test.ts`).
 *
 * `KeyManager` picks the highest-priority enabled command for a sequence, so
 * this rung only behaves if it declares both halves: `priority: 1` to outrank
 * the modal's own Escape, and an `enablement` that goes false on an empty
 * selection so `ModalClose` runs untouched. Neither is observable from the
 * surface — the hook registers and returns nothing — so capture what it hands
 * `useKeyBindings` and assert on that. Delete either half and these fail.
 */

import { renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const useKeyBindings = vi.fn();
const zoomIn = vi.fn();
const zoomOut = vi.fn();
const clearSelectedLabels = vi.fn();
let selectedLabelIds = new Set<string>();

vi.mock("@fiftyone/commands", () => ({
  useKeyBindings: (...args: unknown[]) => useKeyBindings(...args),
  KnownContexts: { Modal: "modal" },
}));

vi.mock("@fiftyone/lighter", () => ({
  useLighter: () => ({ zoomIn, zoomOut }),
}));

vi.mock("@fiftyone/state", () => ({
  useSelectedLabelIds: () => selectedLabelIds,
}));

vi.mock("../Actions/Selected/hooks", () => ({
  useClearSelectedLabels: () => clearSelectedLabels,
}));

import { useVideoExploreKeybindings } from "./useVideoExploreKeybindings";

interface Binding {
  commandId: string;
  sequence: string | string[];
  priority?: number;
  enablement?: () => boolean;
  handler: () => void;
}

/** The binding list the hook registered on its most recent render. */
const bindings = (): Binding[] =>
  useKeyBindings.mock.calls.at(-1)?.[1] as Binding[];

const escapeRung = () =>
  bindings().find((b) => b.commandId === "video-explore-clear-selection");

describe("useVideoExploreKeybindings — Escape ladder", () => {
  beforeEach(() => {
    useKeyBindings.mockClear();
    selectedLabelIds = new Set();
  });

  it("registers into the Modal context", () => {
    renderHook(() => useVideoExploreKeybindings());
    expect(useKeyBindings.mock.calls.at(-1)?.[0]).toBe("modal");
  });

  it("outranks the modal's own Escape", () => {
    renderHook(() => useVideoExploreKeybindings());

    const rung = escapeRung();
    expect(rung?.sequence).toBe("Escape");
    // `ModalClose` binds Escape with no priority; without this the ladder is
    // decided by registration order instead
    expect(rung?.priority).toBe(1);
  });

  it("is disabled on an empty selection, so Escape still closes the modal", () => {
    renderHook(() => useVideoExploreKeybindings());

    expect(escapeRung()?.enablement?.()).toBe(false);
  });

  it("is enabled once something is selected", () => {
    selectedLabelIds = new Set(["label-1"]);
    renderHook(() => useVideoExploreKeybindings());

    expect(escapeRung()?.enablement?.()).toBe(true);
  });

  it("re-reads the selection on re-render rather than closing over the first answer", () => {
    const { rerender } = renderHook(() => useVideoExploreKeybindings());
    expect(escapeRung()?.enablement?.()).toBe(false);

    selectedLabelIds = new Set(["label-1"]);
    rerender();

    expect(escapeRung()?.enablement?.()).toBe(true);
  });

  it("clears the selection when it fires", () => {
    selectedLabelIds = new Set(["label-1"]);
    renderHook(() => useVideoExploreKeybindings());

    escapeRung()?.handler();

    expect(clearSelectedLabels).toHaveBeenCalled();
  });
});
