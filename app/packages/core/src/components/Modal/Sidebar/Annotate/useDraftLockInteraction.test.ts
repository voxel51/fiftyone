/**
 * Copyright 2017-2026, Voxel51, Inc.
 */

import { renderHook } from "@testing-library/react";
import { atom, getDefaultStore } from "jotai";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mockDeselectOverlay = vi.fn();
const mockExit = vi.fn();

vi.mock("@fiftyone/lighter", () => ({
  useLighter: () => ({ scene: { deselectOverlay: mockDeselectOverlay } }),
}));

// useAnnotationContext splits the editing pointer into editingLabelAtom (the
// label atom being edited) and pendingNewTypeAtom (the AddSchema draft slot);
// `current` is the resolved label being edited.
const editingLabelAtom = atom<unknown>(null);
const pendingNewTypeAtom = atom<unknown>(null);
const currentAtom = atom<unknown>(null);

vi.mock("./Edit/useAnnotationContext/atoms", () => ({
  editingLabelAtom,
  pendingNewTypeAtom,
}));
vi.mock("./Edit/useAnnotationContext/selectors", () => ({
  current: currentAtom,
}));
vi.mock("./Edit/useExit", () => ({ default: () => mockExit }));

const { useDraftLockInteraction } = await import("./useDraftLockInteraction");

const STORE = getDefaultStore();

const setEditingLabel = (value: unknown) => STORE.set(editingLabelAtom, value);
const setPendingNewType = (value: unknown) =>
  STORE.set(pendingNewTypeAtom, value);
const setCurrent = (value: unknown) => STORE.set(currentAtom, value);

describe("useDraftLockInteraction", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setEditingLabel(null);
    setPendingNewType(null);
    setCurrent(null);
  });

  describe("interceptSelect", () => {
    it("passes through when nothing is being edited", () => {
      const { result } = renderHook(() => useDraftLockInteraction());

      expect(result.current.interceptSelect?.("o1")).toBe(false);
      expect(mockDeselectOverlay).not.toHaveBeenCalled();
    });

    it("passes through when the edited label is committed (not a draft)", () => {
      setEditingLabel(atom({ isNew: false }));
      setCurrent({ isNew: false, overlay: { id: "committed" } });
      const { result } = renderHook(() => useDraftLockInteraction());

      expect(result.current.interceptSelect?.("o1")).toBe(false);
    });

    it("revokes a FOREIGN selection and consumes while a draft holds the form", () => {
      setEditingLabel(atom({ isNew: true }));
      setCurrent({ isNew: true, overlay: { id: "draft-1" } });
      const { result } = renderHook(() => useDraftLockInteraction());

      expect(result.current.interceptSelect?.("other")).toBe(true);
      expect(mockDeselectOverlay).toHaveBeenCalledWith("other", {
        ignoreSideEffects: true,
      });
    });

    it("consumes but does NOT revoke the draft's own overlay", () => {
      setEditingLabel(atom({ isNew: true }));
      setCurrent({ isNew: true, overlay: { id: "draft-1" } });
      const { result } = renderHook(() => useDraftLockInteraction());

      expect(result.current.interceptSelect?.("draft-1")).toBe(true);
      expect(mockDeselectOverlay).not.toHaveBeenCalled();
    });
  });

  describe("interceptDeselect", () => {
    it("exits and consumes when a pending-new-type slot holds the form", () => {
      setPendingNewType("Detection");
      const { result } = renderHook(() => useDraftLockInteraction());

      expect(result.current.interceptDeselect?.("o1")).toBe(true);
      expect(mockExit).toHaveBeenCalledOnce();
    });

    it("exits and consumes when the edited label is a new draft", () => {
      setEditingLabel(atom({ isNew: true }));
      setCurrent({ isNew: true });
      const { result } = renderHook(() => useDraftLockInteraction());

      expect(result.current.interceptDeselect?.("o1")).toBe(true);
      expect(mockExit).toHaveBeenCalledOnce();
    });

    it("passes through for a committed label (no lock)", () => {
      setEditingLabel(atom({ isNew: false }));
      setCurrent({ isNew: false });
      const { result } = renderHook(() => useDraftLockInteraction());

      expect(result.current.interceptDeselect?.("o1")).toBe(false);
      expect(mockExit).not.toHaveBeenCalled();
    });

    it("passes through when nothing is being edited", () => {
      const { result } = renderHook(() => useDraftLockInteraction());

      expect(result.current.interceptDeselect?.("o1")).toBe(false);
      expect(mockExit).not.toHaveBeenCalled();
    });
  });
});
