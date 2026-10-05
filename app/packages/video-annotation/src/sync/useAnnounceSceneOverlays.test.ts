/**
 * Copyright 2017-2026, Voxel51, Inc.
 */

import type { BaseOverlay } from "@fiftyone/lighter";
import { renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { dispatch, handlers } = vi.hoisted(() => ({
  dispatch: vi.fn(),
  handlers: new Map<string, () => void>(),
}));

vi.mock("@fiftyone/events", () => ({
  getEventBus: () => ({ dispatch }),
}));

vi.mock("@fiftyone/lighter", () => ({
  UNDEFINED_LIGHTER_SCENE_ID: "UNDEFINED_LIGHTER_SCENE",
  useLighterEventHandler: () => (event: string, handler: () => void) =>
    handlers.set(event, handler),
}));

import {
  describeOverlay,
  describeSceneOverlays,
  OVERLAY_SHOWN_EVENT,
  OVERLAYS_SHOWN_EVENT,
  useAnnounceSceneOverlays,
} from "./useAnnounceSceneOverlays";

const overlay = (
  id: string,
  field: string,
  type: string,
  points?: [number, number][],
) =>
  ({
    id,
    field,
    getOverlayType: () => type,
    ...(points ? { getRelativePoints: () => points } : {}),
  }) as unknown as BaseOverlay;

const polyline = overlay("p1", "frames.lines", "PolylineOverlay", [
  [0.1, 0.2],
  [0.3, 0.4],
]);
const box = overlay("d1", "frames.boxes", "DetectionOverlay");
const box2 = overlay("d2", "frames.boxes", "DetectionOverlay");

describe("describeSceneOverlays", () => {
  it("lists each field once and every id", () => {
    expect(describeSceneOverlays([polyline, box, box2])).toEqual({
      fields: "frames.lines frames.boxes",
      ids: "p1 d1 d2",
    });
    expect(describeSceneOverlays([])).toEqual({ fields: "", ids: "" });
  });
});

describe("describeOverlay", () => {
  it("joins a point-bearing overlay's vertices; others have none", () => {
    expect(describeOverlay(polyline)).toEqual({
      id: "p1",
      field: "frames.lines",
      type: "PolylineOverlay",
      points: "0.1,0.2;0.3,0.4",
    });
    expect(describeOverlay(box).points).toBe("");
  });
});

describe("useAnnounceSceneOverlays", () => {
  beforeEach(() => {
    dispatch.mockClear();
    handlers.clear();
  });

  it("announces the set and each overlay only when they change", () => {
    let overlays = [box];
    const scene = {
      getEventChannel: () => "scene-1",
      getAllOverlays: () => overlays,
    } as never;
    renderHook(() => useAnnounceSceneOverlays(scene));
    const paint = () => handlers.get("lighter:overlays-painted")?.();

    paint();
    paint();
    overlays = [box, polyline];
    paint();

    expect(dispatch.mock.calls).toEqual([
      [OVERLAY_SHOWN_EVENT, describeOverlay(box)],
      [OVERLAYS_SHOWN_EVENT, describeSceneOverlays([box])],
      [OVERLAY_SHOWN_EVENT, describeOverlay(polyline)],
      [OVERLAYS_SHOWN_EVENT, describeSceneOverlays([box, polyline])],
    ]);
  });

  it("announces a new scene's overlays even when they match the last scene's", () => {
    const sceneOf = (channel: string) =>
      ({
        getEventChannel: () => channel,
        getAllOverlays: () => [box],
      }) as never;
    const { rerender } = renderHook(
      ({ scene }) => useAnnounceSceneOverlays(scene),
      { initialProps: { scene: sceneOf("explore") } },
    );
    handlers.get("lighter:overlays-painted")?.();
    rerender({ scene: sceneOf("annotate") });
    handlers.get("lighter:overlays-painted")?.();

    expect(dispatch.mock.calls).toEqual([
      [OVERLAY_SHOWN_EVENT, describeOverlay(box)],
      [OVERLAYS_SHOWN_EVENT, describeSceneOverlays([box])],
      [OVERLAY_SHOWN_EVENT, describeOverlay(box)],
      [OVERLAYS_SHOWN_EVENT, describeSceneOverlays([box])],
    ]);
  });

  it("announces nothing without a scene", () => {
    renderHook(() => useAnnounceSceneOverlays(undefined as never));

    handlers.get("lighter:overlays-painted")?.();
    expect(dispatch).not.toHaveBeenCalled();
  });
});
