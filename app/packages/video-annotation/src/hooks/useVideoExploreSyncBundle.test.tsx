/**
 * Copyright 2017-2026, Voxel51, Inc.
 */

/**
 * The read-only sync bundle.
 *
 * Its whole reason for existing is a subtraction: it is
 * `useVideoAnnotationSyncBundle` WITHOUT `useSyncLighterAnnotation`, which
 * installs the draw / create / mode-quit handlers on the scene. Mounting that
 * on Explore would arm annotation editing on a surface with no way to save —
 * the same safety property the read-only lock enforces one layer down.
 *
 * A subtraction is invisible to the type checker and to every other test, so
 * assert it: the editing hook is mocked here, and adding it back to the
 * bundle makes this file fail.
 */

import { renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const useSyncLighterAnnotation = vi.fn();
const useTemporalOverlaySync = vi.fn();
const useSyncMediaTransform = vi.fn();
const useExposeSceneOverlayFieldsForTest = vi.fn();

vi.mock("../sync/useSyncLighterAnnotation", () => ({
  useSyncLighterAnnotation: (...a: unknown[]) => useSyncLighterAnnotation(...a),
}));
vi.mock("../sync/useTemporalOverlaySync", () => ({
  useTemporalOverlaySync: (...a: unknown[]) => useTemporalOverlaySync(...a),
}));
vi.mock("../sync/useSyncMediaTransform", () => ({
  useSyncMediaTransform: (...a: unknown[]) => useSyncMediaTransform(...a),
}));
vi.mock("../sync/useExposeSceneOverlayFieldsForTest", () => ({
  useExposeSceneOverlayFieldsForTest: (...a: unknown[]) =>
    useExposeSceneOverlayFieldsForTest(...a),
}));
vi.mock("../state/exploreFrameLabelFields", () => ({
  useExploreTemporalDetectionFieldPaths: () => ["frames.temporal"],
}));

import { useVideoExploreSyncBundle } from "./useVideoExploreSyncBundle";

const scene = { id: "scene-1" } as never;
const mediaRef = { current: null };

const renderBundle = (canonicalMediaReady = true) =>
  renderHook(() =>
    useVideoExploreSyncBundle({ scene, canonicalMediaReady, mediaRef }),
  );

describe("useVideoExploreSyncBundle", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("never installs the annotation editing path", () => {
    renderBundle();
    expect(useSyncLighterAnnotation).not.toHaveBeenCalled();
  });

  it("pushes temporal overlays into the scene, scoped to Explore's TD paths", () => {
    renderBundle();
    expect(useTemporalOverlaySync).toHaveBeenCalledWith(scene, true, [
      "frames.temporal",
    ]);
  });

  it("keeps the media tracking the viewport", () => {
    renderBundle();
    expect(useSyncMediaTransform).toHaveBeenCalledWith(scene, mediaRef);
  });

  it("passes the media-readiness flag through rather than assuming it", () => {
    renderBundle(false);
    expect(useTemporalOverlaySync).toHaveBeenCalledWith(scene, false, [
      "frames.temporal",
    ]);
  });
});
