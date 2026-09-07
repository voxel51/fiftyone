// @vitest-environment jsdom

/**
 * Copyright 2017-2026, Voxel51, Inc.
 */

import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The selection, as this surface sees it: whatever the `@fiftyone/state`
 * accessors hand back. Those are Recoil-backed in the app and tested there
 * (`useOnSelectLabel.test`), so nothing here needs to know that — the subject
 * of this file is which overlay maps to which label and which events are acted
 * on at all.
 */
const selection = vi.hoisted(() => ({
  map: {} as Record<string, unknown>,
  ids: new Set<string>(),
  reset(initial: Record<string, unknown> = {}) {
    this.map = { ...initial };
    this.ids = new Set(Object.keys(this.map));
  },
}));

vi.mock("@fiftyone/state", () => ({
  useModalSampleId: () => "s1",
  useSelectedLabelIds: () => selection.ids,
  useApplySelectedLabelsDelta:
    () =>
    ({
      add = [],
      remove = [],
    }: {
      add?: { labelId: string }[];
      remove?: string[];
    }) => {
      for (const labelId of remove) {
        delete selection.map[labelId];
      }
      for (const { labelId, ...label } of add) {
        selection.map[labelId] = label;
      }
      selection.ids = new Set(Object.keys(selection.map));
    },
}));

/** Lighter event handlers the hook registers, by event name. */
const handlers = new Map<string, (payload: unknown) => void>();

vi.mock("@fiftyone/lighter", () => ({
  useLighterEventHandler:
    () => (event: string, handler: (payload: unknown) => void) => {
      handlers.set(event, handler);
    },
  UNDEFINED_LIGHTER_SCENE_ID: "undefined-scene",
}));

const { useLighterSelectionEventHandler, useSelectedLabelsSceneSync } =
  await import("./useLighterSelectionEventHandler");

type Overlay = {
  id: string;
  field?: string;
  label?: { _id?: string; frame_number?: number } | null;
};

/** A scene rendering `overlays`, addressable the way the hook addresses them. */
const makeScene = (overlays: Overlay[]) =>
  ({
    getEventChannel: () => "channel",
    getOverlay: (id: string) => overlays.find((o) => o.id === id),
  }) as never;

/** A frame detection: engine instance id on the overlay, backend id on the label. */
const frameOverlay = (id: string, labelId: string, frame = 7): Overlay => ({
  id,
  field: "frames.detections",
  label: { _id: labelId, frame_number: frame },
});

const mount = (scene: never, initial: Record<string, unknown> = {}) => {
  selection.reset(initial);
  return renderHook(() => useLighterSelectionEventHandler(scene));
};

const fire = (payload: {
  selectedIds?: string[];
  deselectedIds?: string[];
  ignoreSideEffects?: boolean;
}) =>
  act(() => {
    handlers.get("lighter:selection-changed")?.({
      selectedIds: [],
      deselectedIds: [],
      ...payload,
    });
  });

describe("useLighterSelectionEventHandler", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    handlers.clear();
    selection.reset();
  });

  it("adds a clicked label, keyed by its backend id and stamped with its frame", async () => {
    mount(makeScene([frameOverlay("inst-a", "label-a", 12)]));

    await fire({ selectedIds: ["inst-a"] });

    expect(selection.map).toEqual({
      "label-a": {
        field: "frames.detections",
        sampleId: "s1",
        type: "default",
        frameNumber: 12,
      },
    });
  });

  it("accumulates across clicks rather than replacing", async () => {
    mount(
      makeScene([
        frameOverlay("inst-a", "label-a"),
        frameOverlay("inst-b", "label-b"),
      ]),
    );

    await fire({ selectedIds: ["inst-a"] });
    await fire({ selectedIds: ["inst-b"] });

    expect(Object.keys(selection.map).sort()).toEqual(["label-a", "label-b"]);
  });

  it("removes a label the user clicked back off, leaving the rest", async () => {
    mount(
      makeScene([
        frameOverlay("inst-a", "label-a"),
        frameOverlay("inst-b", "label-b"),
      ]),
      {
        "label-a": { field: "frames.detections", sampleId: "s1" },
        "label-b": { field: "frames.detections", sampleId: "s1" },
      },
    );

    await fire({ deselectedIds: ["inst-a"] });

    expect(Object.keys(selection.map)).toEqual(["label-b"]);
  });

  /**
   * The scrubbing guarantee. A track leaving the current frame unregisters its
   * overlay, and that drops the overlay's selection as a SIDE EFFECT of
   * removal — flagged. Acting on it would silently empty a selection the user
   * built up, just by letting the video play.
   */
  it("ignores a flagged deselect, so scrubbing past a label keeps it selected", async () => {
    mount(makeScene([frameOverlay("inst-a", "label-a")]), {
      "label-a": { field: "frames.detections", sampleId: "s1" },
    });

    await fire({ deselectedIds: ["inst-a"], ignoreSideEffects: true });

    expect(Object.keys(selection.map)).toEqual(["label-a"]);
  });

  /**
   * The "Manage selected" menu writes the atom itself and THEN applies the
   * choice to the scene, flagged. Mirroring that echo back would be redundant
   * at best and, for any listener that toggles, wrong.
   */
  it("ignores a flagged select", async () => {
    mount(makeScene([frameOverlay("inst-a", "label-a")]));

    await fire({ selectedIds: ["inst-a"], ignoreSideEffects: true });

    expect(selection.map).toEqual({});
  });

  it("leaves a sample-level label frame-less", async () => {
    mount(
      makeScene([
        { id: "inst-td", field: "events", label: { _id: "label-td" } },
      ]),
    );

    await fire({ selectedIds: ["inst-td"] });

    expect(selection.map).toEqual({
      "label-td": { field: "events", sampleId: "s1", type: "default" },
    });
  });

  it("does nothing when the scene no longer holds the overlay", async () => {
    mount(makeScene([]));

    await fire({ selectedIds: ["gone"] });

    expect(selection.map).toEqual({});
  });
});

describe("useSelectedLabelsSceneSync", () => {
  /** A scene that records what was asked of it and answers about its state. */
  const makeSyncScene = (overlays: (Overlay & { selected?: boolean })[]) => {
    const selectOverlay = vi.fn();
    const deselectOverlay = vi.fn();

    return {
      scene: {
        getEventChannel: () => "channel",
        getAllOverlays: () =>
          overlays.map((o) => ({ ...o, isSelected: () => !!o.selected })),
        selectOverlay,
        deselectOverlay,
      } as never,
      selectOverlay,
      deselectOverlay,
    };
  };

  const mountSync = (scene: never, initial: Record<string, unknown> = {}) => {
    selection.reset(initial);
    return renderHook(() => useSelectedLabelsSceneSync(scene));
  };

  beforeEach(() => {
    vi.clearAllMocks();
    handlers.clear();
    selection.reset();
  });

  it("selects an overlay the atom holds and the canvas does not", () => {
    const { scene, selectOverlay, deselectOverlay } = makeSyncScene([
      frameOverlay("inst-a", "label-a"),
    ]);

    mountSync(scene, {
      "label-a": { field: "frames.detections", sampleId: "s1" },
    });

    expect(selectOverlay).toHaveBeenCalledWith("inst-a");
    expect(deselectOverlay).not.toHaveBeenCalled();
  });

  /**
   * The post-tag case. `Tag.tsx` resets `selectedLabels` on success and knows
   * nothing about a canvas, so without this the labels you just tagged stay
   * highlighted while the Tag button's count drops to zero.
   */
  it("deselects an overlay the atom no longer holds", () => {
    const { scene, deselectOverlay } = makeSyncScene([
      { ...frameOverlay("inst-a", "label-a"), selected: true },
    ]);

    mountSync(scene, {});

    expect(deselectOverlay).toHaveBeenCalledWith("inst-a");
  });

  it("touches nothing when the canvas already agrees", () => {
    const { scene, selectOverlay, deselectOverlay } = makeSyncScene([
      { ...frameOverlay("inst-a", "label-a"), selected: true },
      frameOverlay("inst-b", "label-b"),
    ]);

    mountSync(scene, {
      "label-a": { field: "frames.detections", sampleId: "s1" },
    });

    expect(selectOverlay).not.toHaveBeenCalled();
    expect(deselectOverlay).not.toHaveBeenCalled();
  });

  it("leaves the canonical media alone — it carries no field and is not selectable", () => {
    // `selected: true` against an empty atom is what makes this meaningful:
    // an overlay that merely already agrees would be skipped either way, so it
    // would pass with no field guard at all
    const { scene, selectOverlay, deselectOverlay } = makeSyncScene([
      { id: "media", selected: true },
    ]);

    mountSync(scene, {});

    expect(selectOverlay).not.toHaveBeenCalled();
    expect(deselectOverlay).not.toHaveBeenCalled();
  });

  /**
   * Unflagged on purpose: that is what carries the change on to the annotation
   * engine, whose active set repaints an overlay that leaves the frame and
   * comes back. A flagged call would paint the box now and lose it on the next
   * scrub.
   */
  it("drives the scene as a user gesture so the change reaches the engine", () => {
    const { scene, selectOverlay } = makeSyncScene([
      frameOverlay("inst-a", "label-a"),
    ]);

    mountSync(scene, {
      "label-a": { field: "frames.detections", sampleId: "s1" },
    });

    expect(selectOverlay).toHaveBeenCalledWith("inst-a");
    // no options argument at all — an ignoreSideEffects flag here would be
    // invisible to every other owner of the selection
    expect(selectOverlay.mock.calls[0]).toHaveLength(1);
  });

  it("does nothing without a scene", () => {
    expect(() =>
      renderHook(() => useSelectedLabelsSceneSync(null)),
    ).not.toThrow();
  });
});
