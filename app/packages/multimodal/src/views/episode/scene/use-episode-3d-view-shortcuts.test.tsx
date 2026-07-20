import { cleanup, fireEvent, render, renderHook } from "@testing-library/react";
import { Quaternion, Vector3 } from "three";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { PointCloudCameraPose } from "../../../visualization/panels/point-cloud";
import { EMPTY_EPISODE_FRAME_GRAPH_SUMMARY } from "../../../runtime/frame-transforms";
import type { EpisodeFrameTransformsState } from "./use-episode-frame-transforms";
import {
  egoViewCameraPose,
  resolveEpisode3dEgoFrameId,
  topViewCameraPose,
  useEpisode3dViewShortcuts,
  type Episode3dViewShortcutsOptions,
} from "./use-episode-3d-view-shortcuts";

afterEach(() => {
  cleanup();
});

describe("resolveEpisode3dEgoFrameId", () => {
  it("prefers trained ego frame names in preference order", () => {
    expect(
      resolveEpisode3dEgoFrameId({
        cameraTargetFrameId: "lidar_top",
        frameIds: ["CAM_FRONT", "base_link", "ego_vehicle", "map"],
      }),
    ).toBe("base_link");
    expect(
      resolveEpisode3dEgoFrameId({
        cameraTargetFrameId: "lidar_top",
        frameIds: ["CAM_FRONT", "ego_vehicle", "map"],
      }),
    ).toBe("ego_vehicle");
  });

  it("falls back to the camera target frame when no ego name matches", () => {
    expect(
      resolveEpisode3dEgoFrameId({
        cameraTargetFrameId: "lidar_top",
        frameIds: ["CAM_FRONT", "lidar_top", "map"],
      }),
    ).toBe("lidar_top");
  });

  it("returns null when nothing resolves", () => {
    expect(
      resolveEpisode3dEgoFrameId({ cameraTargetFrameId: "", frameIds: [] }),
    ).toBeNull();
  });
});

describe("egoViewCameraPose", () => {
  it("places a deterministic chase view behind an identity ego pose", () => {
    const pose = egoViewCameraPose({
      rotation: new Quaternion(),
      translation: new Vector3(),
    });

    expect(pose.target).toEqual([0, 0, 0]);
    expect(pose.position[0]).toBeCloseTo(-22);
    expect(pose.position[1]).toBeCloseTo(0);
    expect(pose.position[2]).toBeCloseTo(7);
  });

  it("stays behind the ego along its yaw heading and keeps a level horizon", () => {
    // Ego at (100, 50, 1) heading +Y (yaw 90°), with some roll mixed in that
    // heading extraction must ignore.
    const yaw = new Quaternion().setFromAxisAngle(
      new Vector3(0, 0, 1),
      Math.PI / 2,
    );
    const roll = new Quaternion().setFromAxisAngle(
      new Vector3(1, 0, 0),
      Math.PI / 8,
    );
    const pose = egoViewCameraPose({
      rotation: yaw.clone().multiply(roll),
      translation: new Vector3(100, 50, 1),
    });

    expect(pose.target).toEqual([100, 50, 1]);
    expect(pose.position[0]).toBeCloseTo(100);
    expect(pose.position[1]).toBeCloseTo(28);
    expect(pose.position[2]).toBeCloseTo(8);
  });

  it("places above along the configured up axis", () => {
    const pose = egoViewCameraPose(
      {
        rotation: new Quaternion(),
        translation: new Vector3(),
      },
      "y",
    );

    expect(pose.target).toEqual([0, 0, 0]);
    expect(pose.position[0]).toBeCloseTo(-22);
    expect(pose.position[1]).toBeCloseTo(7);
    expect(pose.position[2]).toBeCloseTo(0);
  });
});

describe("topViewCameraPose", () => {
  it("preserves the current orbit distance and leans against the heading", () => {
    const pose = topViewCameraPose({
      anchor: new Vector3(10, 20, 0),
      currentDistance: 100,
      rotation: new Quaternion(),
    });

    expect(pose.target).toEqual([10, 20, 0]);
    // Height = current distance; lean is opposite the +X heading so the ego
    // forward direction reads as screen-up.
    expect(pose.position[0]).toBeCloseTo(8);
    expect(pose.position[1]).toBeCloseTo(20);
    expect(pose.position[2]).toBeCloseTo(100);
  });

  it("clamps the height and defaults to north-up without a heading", () => {
    const low = topViewCameraPose({
      anchor: new Vector3(),
      currentDistance: 3,
      rotation: null,
    });
    expect(low.position[2]).toBeCloseTo(25);
    expect(low.position[1]).toBeLessThan(0);

    const high = topViewCameraPose({
      anchor: new Vector3(),
      currentDistance: 5000,
      rotation: null,
    });
    expect(high.position[2]).toBeCloseTo(400);

    const unknown = topViewCameraPose({
      anchor: new Vector3(),
      currentDistance: null,
      rotation: null,
    });
    expect(unknown.position[2]).toBeCloseTo(80);
  });

  it("uses the configured up axis for bird's-eye height", () => {
    const pose = topViewCameraPose({
      anchor: new Vector3(10, 20, 30),
      currentDistance: 100,
      rotation: new Quaternion(),
      sceneUpAxis: "y",
    });

    expect(pose.target).toEqual([10, 20, 30]);
    expect(pose.position[0]).toBeCloseTo(8);
    expect(pose.position[1]).toBeCloseTo(120);
    expect(pose.position[2]).toBeCloseTo(30);
  });
});

describe("useEpisode3dViewShortcuts", () => {
  it("exposes the same camera presets for on-screen controls", () => {
    const onApplyCameraPose = vi.fn();
    const { result } = renderHook(useEpisode3dViewShortcuts, {
      initialProps: shortcutOptions({
        isActive: false,
        onApplyCameraPose,
      }),
    });

    result.current.applyEgoView();
    result.current.applyTopView();

    expect(onApplyCameraPose).toHaveBeenCalledTimes(2);
    expect(onApplyCameraPose.mock.calls[0][0].target).toEqual([10, 0, 0]);
    expect(onApplyCameraPose.mock.calls[1][0].target).toEqual([10, 0, 0]);
    expect(onApplyCameraPose.mock.calls[0][1]).toBe("focus");
    expect(onApplyCameraPose.mock.calls[1][1]).toBe("focus");
  });

  it("applies the ego view on E and the top view on T through the focus channel", () => {
    const onApplyCameraPose = vi.fn();
    renderHook(useEpisode3dViewShortcuts, {
      initialProps: shortcutOptions({ onApplyCameraPose }),
    });

    fireEvent.keyDown(window, { code: "KeyE" });
    expect(onApplyCameraPose).toHaveBeenCalledTimes(1);
    let [pose, source] = onApplyCameraPose.mock.calls[0];
    expect(source).toBe("focus");
    // Ego (base_link) sits at +10 x in the world frame.
    expect(pose.target).toEqual([10, 0, 0]);
    expect(pose.position[0]).toBeCloseTo(-12);
    expect(pose.position[2]).toBeCloseTo(7);

    fireEvent.keyDown(window, { code: "KeyT" });
    expect(onApplyCameraPose).toHaveBeenCalledTimes(2);
    [pose, source] = onApplyCameraPose.mock.calls[1];
    expect(source).toBe("focus");
    expect(pose.target).toEqual([10, 0, 0]);
    // Height preserves the displayed pose's orbit distance (position
    // [0,0,50] → target [0,0,0] = 50m).
    expect(pose.position[2]).toBeCloseTo(50);
  });

  it("ignores modified keys, other keys, and typing targets", () => {
    const onApplyCameraPose = vi.fn();
    renderHook(useEpisode3dViewShortcuts, {
      initialProps: shortcutOptions({ onApplyCameraPose }),
    });

    fireEvent.keyDown(window, { code: "KeyT", shiftKey: true });
    fireEvent.keyDown(window, { code: "KeyE", metaKey: true });
    fireEvent.keyDown(window, { code: "KeyZ" });
    expect(onApplyCameraPose).not.toHaveBeenCalled();

    const { getByTestId } = render(<input data-testid="text-input" />);
    fireEvent.keyDown(getByTestId("text-input"), { code: "KeyE" });
    expect(onApplyCameraPose).not.toHaveBeenCalled();
  });

  it("leaves E and T available to other handlers when the tile is inactive", () => {
    const onApplyCameraPose = vi.fn();
    const fallbackHandler = vi.fn((event: KeyboardEvent) => {
      expect(event.defaultPrevented).toBe(false);
    });
    renderHook(useEpisode3dViewShortcuts, {
      initialProps: shortcutOptions({ isActive: false, onApplyCameraPose }),
    });
    window.addEventListener("keydown", fallbackHandler);

    try {
      const handled = fireEvent.keyDown(window, { code: "KeyE" });

      expect(handled).toBe(true);
      expect(onApplyCameraPose).not.toHaveBeenCalled();
      expect(fallbackHandler).toHaveBeenCalledTimes(1);
    } finally {
      window.removeEventListener("keydown", fallbackHandler);
    }
  });

  it("no-ops when neither an ego pose nor a displayed pose resolves", () => {
    const onApplyCameraPose = vi.fn();
    renderHook(useEpisode3dViewShortcuts, {
      initialProps: shortcutOptions({
        frameTransforms: missingTransforms(),
        getDisplayedCameraPose: () => null,
        onApplyCameraPose,
        worldFrameId: "map",
      }),
    });

    fireEvent.keyDown(window, { code: "KeyE" });
    fireEvent.keyDown(window, { code: "KeyT" });
    expect(onApplyCameraPose).not.toHaveBeenCalled();
  });

  it("anchors the top view on the current orbit target without an ego", () => {
    const onApplyCameraPose = vi.fn();
    renderHook(useEpisode3dViewShortcuts, {
      initialProps: shortcutOptions({
        frameTransforms: missingTransforms(),
        onApplyCameraPose,
      }),
    });

    fireEvent.keyDown(window, { code: "KeyT" });
    expect(onApplyCameraPose).toHaveBeenCalledTimes(1);
    const [pose] = onApplyCameraPose.mock.calls[0];
    expect(pose.target).toEqual([0, 0, 0]);
    expect(pose.position[2]).toBeCloseTo(50);
  });

  it("applies shortcuts using the configured up axis", () => {
    const onApplyCameraPose = vi.fn();
    renderHook(useEpisode3dViewShortcuts, {
      initialProps: shortcutOptions({
        onApplyCameraPose,
        sceneUpAxis: "y",
      }),
    });

    fireEvent.keyDown(window, { code: "KeyE" });
    expect(onApplyCameraPose).toHaveBeenCalledTimes(1);
    let [pose] = onApplyCameraPose.mock.calls[0];
    expect(pose.target).toEqual([10, 0, 0]);
    expect(pose.position[0]).toBeCloseTo(-12);
    expect(pose.position[1]).toBeCloseTo(7);
    expect(pose.position[2]).toBeCloseTo(0);

    fireEvent.keyDown(window, { code: "KeyT" });
    expect(onApplyCameraPose).toHaveBeenCalledTimes(2);
    [pose] = onApplyCameraPose.mock.calls[1];
    expect(pose.target).toEqual([10, 0, 0]);
    expect(pose.position[1]).toBeCloseTo(50);
  });

  it("unbinds the listener on unmount", () => {
    const onApplyCameraPose = vi.fn();
    const { unmount } = renderHook(useEpisode3dViewShortcuts, {
      initialProps: shortcutOptions({ onApplyCameraPose }),
    });

    unmount();
    fireEvent.keyDown(window, { code: "KeyE" });
    expect(onApplyCameraPose).not.toHaveBeenCalled();
  });
});

function shortcutOptions(
  overrides: Partial<Episode3dViewShortcutsOptions> = {},
): Episode3dViewShortcutsOptions {
  return {
    cameraTargetFrameId: "base_link",
    frameIds: ["base_link", "lidar", "map"],
    frameTransforms: translationTransforms(10, 0, 0),
    getDisplayedCameraPose: () => displayedPose(),
    isActive: true,
    onApplyCameraPose: vi.fn(),
    playbackTimeNs: 0n,
    worldFrameId: "map",
    ...overrides,
  };
}

function displayedPose(): PointCloudCameraPose {
  return { position: [0, 0, 50], target: [0, 0, 0] };
}

function translationTransforms(
  x: number,
  y: number,
  z: number,
): EpisodeFrameTransformsState {
  return {
    error: null,
    frameIds: ["base_link", "lidar", "map"],
    getPlacementReadiness: () => ({ frameIds: [], status: "ready" }),
    indexedDynamicRanges: () => [],
    prefetchPlacement: () => undefined,
    resolve: (sourceFrameId, targetFrameId) => ({
      sourceFrameId,
      status: "resolved",
      targetFrameId,
      transform: {
        rotation: new Quaternion(),
        sourceFrameId,
        targetFrameId,
        translation: new Vector3(x, y, z),
      },
    }),
    status: "ready",
    summarizeGraph: () => EMPTY_EPISODE_FRAME_GRAPH_SUMMARY,
  };
}

function missingTransforms(): EpisodeFrameTransformsState {
  return {
    error: null,
    frameIds: [],
    getPlacementReadiness: () => ({
      frameIds: ["lidar"],
      status: "definitiveMissing",
    }),
    indexedDynamicRanges: () => [],
    prefetchPlacement: () => undefined,
    resolve: (sourceFrameId, targetFrameId) => ({
      sourceFrameId,
      status: "missing",
      targetFrameId,
    }),
    status: "loading",
    summarizeGraph: () => EMPTY_EPISODE_FRAME_GRAPH_SUMMARY,
  };
}
