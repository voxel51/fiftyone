/**
 * Copyright 2017-2026, Voxel51, Inc.
 */

/**
 * The tile's `mode` separates a read-only Explore canvas from the editing one,
 * and none of it shows in the DOM: the scene flags, the scene handed to the
 * tooltip and selection bridge, and which sync host renders. Capture each seam.
 */

import { cleanup, render, screen } from "@testing-library/react";
import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const SCENE = { id: "scene" };
const lighterMediaScene = vi.fn();
const tooltip = vi.fn();
const bridge = vi.fn();
const publishFrame = vi.fn();
const syncProps: Record<string, unknown[]> = { annotate: [], explore: [] };

vi.mock("@fiftyone/lighter", () => ({
  useViewportInitReveal: () => true,
}));

vi.mock("@fiftyone/playback", () => ({
  useStream: () => undefined,
  usePublishCurrentFrame: (frame: number) => publishFrame(frame),
}));

vi.mock("../hooks/useLighterMediaScene", () => ({
  useLighterMediaScene: (options: unknown) => {
    lighterMediaScene(options);
    return { scene: SCENE, canonicalMediaReady: true };
  },
}));

vi.mock("../state/useCurrentFrame", () => ({
  useCurrentFrame: () => 7,
}));

vi.mock(
  "../../../core/src/components/Modal/Lighter/useLighterSelectionEventHandler",
  () => ({
    useLighterSelectionBridge: (scene: unknown) => bridge(scene),
  }),
);

vi.mock(
  "../../../core/src/components/Modal/Lighter/useLighterTooltipEventHandler",
  () => ({
    useLighterTooltipEventHandler: (scene: unknown) => tooltip(scene),
  }),
);

vi.mock("./SurfaceSync", () => ({
  AnnotateSync: (props: unknown) => {
    syncProps.annotate.push(props);
    return <div data-testid="annotate-sync" />;
  },
  ExploreSync: (props: unknown) => {
    syncProps.explore.push(props);
    return <div data-testid="explore-sync" />;
  },
}));

import { ImaVidLighterTile } from "./ImaVidLighterTile";

const sceneOptions = () =>
  lighterMediaScene.mock.calls.at(-1)?.[0] as Record<string, unknown>;

describe("ImaVidLighterTile", () => {
  afterEach(cleanup);

  beforeEach(() => {
    vi.clearAllMocks();
    syncProps.annotate = [];
    syncProps.explore = [];
    // jsdom has no 2D context; the paint effect tolerates a null one.
    HTMLCanvasElement.prototype.getContext = () => null;
  });

  it("explore: read-only filtered scene, tooltip, selection bridge, explore sync, playhead frame", () => {
    render(<ImaVidLighterTile mode="explore" />);

    expect(sceneOptions()).toMatchObject({
      readOnly: true,
      multipleSelection: true,
      filterLabels: true,
    });
    expect(tooltip).toHaveBeenLastCalledWith(SCENE);
    expect(bridge).toHaveBeenLastCalledWith(SCENE);

    expect(screen.getByTestId("explore-sync")).toBeTruthy();
    expect(screen.queryByTestId("annotate-sync")).toBeNull();
    const props = syncProps.explore.at(-1) as {
      scene: unknown;
      canonicalMediaReady: boolean;
      mediaRef: React.RefObject<HTMLElement | null>;
    };
    expect(props.scene).toBe(SCENE);
    expect(props.canonicalMediaReady).toBe(true);
    // the frame canvas is what the media transform keeps in step
    expect(props.mediaRef.current).toBe(
      document.querySelector("[data-cy='imavid-frame-canvas']"),
    );

    expect(publishFrame).toHaveBeenCalledWith(7);
  });

  it("annotate (default): writable single-select scene, no tooltip or bridge, annotate sync", () => {
    render(<ImaVidLighterTile />);

    expect(sceneOptions()).toMatchObject({
      readOnly: false,
      multipleSelection: false,
      filterLabels: false,
    });
    expect(tooltip).toHaveBeenLastCalledWith(null);
    expect(bridge).toHaveBeenLastCalledWith(null);

    expect(screen.getByTestId("annotate-sync")).toBeTruthy();
    expect(screen.queryByTestId("explore-sync")).toBeNull();
    expect(publishFrame).not.toHaveBeenCalled();
  });
});
