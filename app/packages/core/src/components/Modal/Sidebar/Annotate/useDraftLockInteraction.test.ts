/**
 * Copyright 2017-2026, Voxel51, Inc.
 */

import { renderHook } from "@testing-library/react";
import { type Atom, atom, getDefaultStore } from "jotai";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mockDeselectOverlay = vi.fn();
const mockExit = vi.fn();

vi.mock("@fiftyone/lighter", () => ({
  useLighter: () => ({ scene: { deselectOverlay: mockDeselectOverlay } }),
}));

// editing holds null | a draft-slot string | the label's atom; current is the
// resolved label being edited
const editingAtom = atom<unknown>(null);
const currentAtom = atom<unknown>(null);

vi.mock("./Edit", () => ({ editing: editingAtom }));
vi.mock("./Edit/state", () => ({ current: currentAtom }));
vi.mock("./Edit/useExit", () => ({ default: () => mockExit }));

const { useDraftLockInteraction } = await import("./useDraftLockInteraction");

const STORE = getDefaultStore();

const setEditing = (value: unknown) => STORE.set(editingAtom, value);
const setCurrent = (value: unknown) => STORE.set(currentAtom, value);

describe("useDraftLockInteraction", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setEditing(null);
    setCurrent(null);
  });

  describe("interceptSelect", () => {
    it("passes through when nothing is being edited", () => {
      const { result } = renderHook(() => useDraftLockInteraction());

      expect(result.current.interceptSelect?.("o1")).toBe(false);
      expect(mockDeselectOverlay).not.toHaveBeenCalled();
    });

    it("passes through when the edited label is committed (not a draft)", () => {
      setEditing(atom({ isNew: false }));
      setCurrent({ isNew: false, overlay: { id: "committed" } });
      const { result } = renderHook(() => useDraftLockInteraction());

      expect(result.current.interceptSelect?.("o1")).toBe(false);
    });

    it("revokes a FOREIGN selection and consumes while a draft holds the form", () => {
      setEditing("draft-slot");
      setCurrent({ isNew: true, overlay: { id: "draft-1" } });
      const { result } = renderHook(() => useDraftLockInteraction());

      expect(result.current.interceptSelect?.("other")).toBe(true);
      expect(mockDeselectOverlay).toHaveBeenCalledWith("other", {
        ignoreSideEffects: true,
      });
    });

    it("consumes but does NOT revoke the draft's own overlay", () => {
      setEditing("draft-slot");
      setCurrent({ isNew: true, overlay: { id: "draft-1" } });
      const { result } = renderHook(() => useDraftLockInteraction());

      expect(result.current.interceptSelect?.("draft-1")).toBe(true);
      expect(mockDeselectOverlay).not.toHaveBeenCalled();
    });
  });

  describe("interceptDeselect", () => {
    it("exits and consumes when a string draft slot holds the form", () => {
      setEditing("draft-slot");
      const { result } = renderHook(() => useDraftLockInteraction());

      expect(result.current.interceptDeselect?.("o1")).toBe(true);
      expect(mockExit).toHaveBeenCalledOnce();
    });

    it("exits and consumes when the edited atom is a new draft", () => {
      setEditing(atom({ isNew: true }) as Atom<unknown>);
      const { result } = renderHook(() => useDraftLockInteraction());

      expect(result.current.interceptDeselect?.("o1")).toBe(true);
      expect(mockExit).toHaveBeenCalledOnce();
    });

    it("passes through for a committed label (no lock)", () => {
      setEditing(atom({ isNew: false }) as Atom<unknown>);
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
