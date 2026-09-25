/**
 * Copyright 2017-2026, Voxel51, Inc.
 *
 * @vitest-environment jsdom
 */

import { renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  useKeyBindings: vi.fn(),
  markKeyframe: vi.fn(),
  selectedIds: ["instance-A"] as string[],
  /** The presented frame, deliberately not derivable from any raw time here. */
  frame: 7,
}));

vi.mock("@fiftyone/commands", () => ({
  useKeyBindings: (...args: unknown[]) => h.useKeyBindings(...args),
  KnownContexts: { ModalAnnotate: "modal-annotate" },
}));

vi.mock("@fiftyone/lighter", () => ({
  useLighter: () => ({
    scene: { getSelectedOverlayIds: () => h.selectedIds },
  }),
}));

vi.mock("../state/useVideoSelection", () => ({
  useSelectionIsKeyframeable: () => true,
}));

vi.mock("../state/useCurrentFrame", () => ({
  useCurrentFrameGetter: () => () => h.frame,
}));

vi.mock("./useVideoSurfaceActions", () => ({
  useVideoSurfaceActions: () => ({ markKeyframe: h.markKeyframe }),
}));

import { useRegisterVideoAnnotationKeybindings } from "./useRegisterVideoAnnotationKeybindings";

interface Binding {
  commandId: string;
  handler: () => void;
}

const binding = (commandId: string): Binding =>
  (h.useKeyBindings.mock.calls.at(-1)?.[1] as Binding[]).find(
    (b) => b.commandId === commandId,
  )!;

describe("useRegisterVideoAnnotationKeybindings", () => {
  beforeEach(() => {
    h.useKeyBindings.mockClear();
    h.markKeyframe.mockClear();
  });

  it("K marks the keyframe at the presented frame", () => {
    renderHook(() => useRegisterVideoAnnotationKeybindings());

    binding("annotation-mark-keyframe").handler();

    expect(h.markKeyframe).toHaveBeenCalledWith(7, ["instance-A"]);
  });
});
