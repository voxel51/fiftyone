/**
 * Copyright 2017-2026, Voxel51, Inc.
 */

// @vitest-environment jsdom
import { renderHook } from "@testing-library/react";
import { atom, getDefaultStore } from "jotai";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  createMockAnnotationContext,
  type MockAnnotationContext,
} from "./Edit/__testing__/mocks";

// vi.mock factories run before imports, so shared mutable state lives in
// vi.hoisted() — also pre-import.
const refs = vi.hoisted(() => ({
  annotationContext: null as unknown,
  scene: null as unknown,
  onExit: null as unknown,
  isGenerated: false,
}));

vi.mock("recoil", async (importOriginal) => {
  const actual = await importOriginal<typeof import("recoil")>();
  return { ...actual, useRecoilValue: () => refs.isGenerated };
});

vi.mock("@fiftyone/lighter", () => ({
  useLighter: () => ({ scene: refs.scene }),
}));

vi.mock("@fiftyone/state", () => ({
  isGeneratedView: atom(false),
}));

vi.mock("./Edit/useAnnotationContext", () => ({
  useAnnotationContext: () => refs.annotationContext,
}));

vi.mock("./Edit/useExit", () => ({
  default: () => refs.onExit,
}));

// `useFocus` does `STORE.get(labelMap)[id]` to resolve the clicked overlay
// to its label atom. Back it with a controllable jotai atom so tests can
// install fake labels keyed by overlay id.
const labelMapAtom = atom<Record<string, unknown>>({});
vi.mock("./useLabels", () => ({
  labelMap: labelMapAtom,
}));

const { default: useFocus } = await import("./useFocus");

// ── Helpers ──────────────────────────────────────────────────────────────────

const store = getDefaultStore();
const annotationContext = () => refs.annotationContext as MockAnnotationContext;
const sceneMock = () =>
  refs.scene as {
    selectOverlay: ReturnType<typeof vi.fn>;
    deselectOverlay: ReturnType<typeof vi.fn>;
  };
const onExitMock = () => refs.onExit as ReturnType<typeof vi.fn>;

beforeEach(() => {
  vi.clearAllMocks();
  refs.scene = {
    selectOverlay: vi.fn(),
    deselectOverlay: vi.fn(),
  };
  refs.onExit = vi.fn();
  refs.isGenerated = false;
  refs.annotationContext = createMockAnnotationContext();
  store.set(labelMapAtom, {});
});

// ── Tests ────────────────────────────────────────────────────────────────────

describe("useFocus.selectOverlay", () => {
  it("does nothing when ignoreSideEffects is true", () => {
    const { result } = renderHook(() => useFocus());
    result.current.selectOverlay("ov-1", { ignoreSideEffects: true });

    expect(annotationContext().select).not.toHaveBeenCalled();
    expect(sceneMock().deselectOverlay).not.toHaveBeenCalled();
    expect(sceneMock().selectOverlay).not.toHaveBeenCalled();
  });

  it("selects the clicked overlay when nothing is currently being edited", () => {
    const labelAtom = atom({});
    store.set(labelMapAtom, { "ov-1": labelAtom });

    const { result } = renderHook(() => useFocus());
    result.current.selectOverlay("ov-1");

    expect(annotationContext().select).toHaveBeenCalledTimes(1);
    expect(annotationContext().select).toHaveBeenCalledWith(labelAtom);
    expect(sceneMock().selectOverlay).toHaveBeenCalledWith("ov-1", {
      ignoreSideEffects: true,
    });
  });

  it("bails when the overlay id has no entry in labelMap", () => {
    const { result } = renderHook(() => useFocus());
    result.current.selectOverlay("missing");

    expect(annotationContext().select).not.toHaveBeenCalled();
    expect(sceneMock().selectOverlay).not.toHaveBeenCalled();
  });

  // REGRESSION: useFocus.selectOverlay used to read `selected.label` from
  // the closure, which is stale when this fires from a synchronous lighter
  // event chain that ran after `createNew` updated `editingLabelAtom` but
  // before React re-rendered. The stale closure saw `label === null`, fell
  // through to `select(label)`, and clobbered the just-set mask flag —
  // briefly flipping Detection Mode on during brush paint.
  it("reads selection state fresh from the store, not the stale closure", () => {
    const editingLabel = {
      isNew: false,
      overlay: { id: "ov-currently-editing" },
    };

    // Mount with a context whose render-time `selected.label` is null
    // (mimicking the pre-render state) but whose `readSelected()` returns
    // the post-createNew state with a label set.
    refs.annotationContext = createMockAnnotationContext({
      selected: { label: null },
      readSelected: vi.fn().mockReturnValue({
        label: editingLabel,
        pendingNewType: null,
      }),
    });

    const labelAtom = atom({});
    store.set(labelMapAtom, { "ov-new": labelAtom });

    const { result } = renderHook(() => useFocus());
    result.current.selectOverlay("ov-new");

    // The fresh read sees a label is being edited → cancel the new
    // selection rather than clobbering the editing state with `select()`.
    expect(annotationContext().select).not.toHaveBeenCalled();
    expect(sceneMock().deselectOverlay).toHaveBeenCalledWith("ov-new", {
      ignoreSideEffects: true,
    });
    expect(annotationContext().readSelected).toHaveBeenCalled();
  });

  it("bails silently when the currently-editing label is `isNew` (mid-create)", () => {
    // Populate labelMap so a buggy stale-closure read would fall through
    // to `select(labelAtom)` — this test must catch that regression.
    const labelAtom = atom({});
    store.set(labelMapAtom, { "ov-new": labelAtom });

    refs.annotationContext = createMockAnnotationContext({
      selected: { label: null },
      readSelected: vi.fn().mockReturnValue({
        label: { isNew: true, overlay: { id: "ov-other" } },
        pendingNewType: null,
      }),
    });

    const { result } = renderHook(() => useFocus());
    result.current.selectOverlay("ov-new");

    expect(annotationContext().select).not.toHaveBeenCalled();
    expect(sceneMock().deselectOverlay).not.toHaveBeenCalled();
    expect(sceneMock().selectOverlay).not.toHaveBeenCalled();
  });

  it("treats a re-click on the currently-editing overlay as a no-op", () => {
    const labelAtom = atom({});
    store.set(labelMapAtom, { "ov-1": labelAtom });

    refs.annotationContext = createMockAnnotationContext({
      selected: { label: null },
      readSelected: vi.fn().mockReturnValue({
        label: { isNew: false, overlay: { id: "ov-1" } },
        pendingNewType: null,
      }),
    });

    const { result } = renderHook(() => useFocus());
    result.current.selectOverlay("ov-1");

    expect(annotationContext().select).not.toHaveBeenCalled();
    expect(sceneMock().deselectOverlay).not.toHaveBeenCalled();
  });

  it("cancels the new selection when a pending new-type schema flow is active", () => {
    // labelMap entry present so a stale-closure read would erroneously
    // call `select` instead of bailing.
    const labelAtom = atom({});
    store.set(labelMapAtom, { "ov-1": labelAtom });

    refs.annotationContext = createMockAnnotationContext({
      selected: { label: null, pendingNewType: null },
      readSelected: vi.fn().mockReturnValue({
        label: null,
        pendingNewType: "Detection",
      }),
    });

    const { result } = renderHook(() => useFocus());
    result.current.selectOverlay("ov-1");

    expect(annotationContext().select).not.toHaveBeenCalled();
    expect(sceneMock().deselectOverlay).toHaveBeenCalledWith("ov-1", {
      ignoreSideEffects: true,
    });
  });
});

describe("useFocus.deselectOverlay", () => {
  it("calls onExit when not in a generated view", () => {
    const { result } = renderHook(() => useFocus());
    result.current.deselectOverlay();
    expect(onExitMock()).toHaveBeenCalledTimes(1);
  });

  it("does nothing when ignoreSideEffects is true", () => {
    const { result } = renderHook(() => useFocus());
    result.current.deselectOverlay({ ignoreSideEffects: true });
    expect(onExitMock()).not.toHaveBeenCalled();
  });

  it("does nothing in a generated view (edit mode is sticky)", () => {
    refs.isGenerated = true;
    const { result } = renderHook(() => useFocus());
    result.current.deselectOverlay();
    expect(onExitMock()).not.toHaveBeenCalled();
  });
});
