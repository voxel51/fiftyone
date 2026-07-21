import { cleanup, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import type { PointCloudVisualization } from "../../../ir";
import { VISUALIZATION_KIND } from "../../../visualization";
import type { EpisodeStreamPlaybackFrame } from "../playback/use-episode-stream-values";
import { usePointCloudColorCapabilities } from "./use-point-cloud-color-capabilities";

describe("usePointCloudColorCapabilities", () => {
  afterEach(() => cleanup());

  it("collects scalar fields and rgb presence per stream", () => {
    const { result } = renderHook(() =>
      usePointCloudColorCapabilities(
        ["/lidar", "/radar"],
        [
          frame({ scalarFields: ["intensity", "ring"] }),
          frame({ hasColors: true, scalarFields: ["rcs", "vx_comp"] }),
        ],
      ),
    );

    expect(result.current.get("/lidar")).toEqual({
      hasRgb: false,
      scalarFields: ["intensity", "ring"],
    });
    expect(result.current.get("/radar")).toEqual({
      hasRgb: true,
      scalarFields: ["rcs", "vx_comp"],
    });
  });

  it("omits streams that have not delivered a frame yet", () => {
    const { result } = renderHook(() =>
      usePointCloudColorCapabilities(["/lidar"], [null]),
    );

    expect(result.current.size).toBe(0);
  });

  it("accumulates channels across frames instead of tracking the current tick", () => {
    const { rerender, result } = renderHook(
      ({
        frames,
      }: {
        frames: readonly (EpisodeStreamPlaybackFrame<PointCloudVisualization> | null)[];
      }) => usePointCloudColorCapabilities(["/scan"], frames),
      { initialProps: { frames: [frame({ scalarFields: ["intensity"] })] } },
    );

    // A later message without the channel (e.g. discarded malformed
    // intensities) must not remove it from the settings UI.
    rerender({ frames: [frame({ scalarFields: [] })] });
    expect(result.current.get("/scan")).toEqual({
      hasRgb: false,
      scalarFields: ["intensity"],
    });
  });

  it("keeps the map identity stable across ticks with no new channels", () => {
    const { rerender, result } = renderHook(
      ({
        frames,
      }: {
        frames: readonly (EpisodeStreamPlaybackFrame<PointCloudVisualization> | null)[];
      }) => usePointCloudColorCapabilities(["/lidar"], frames),
      {
        initialProps: {
          frames: [frame({ scalarFields: ["intensity"] })],
        },
      },
    );
    const first = result.current;

    rerender({ frames: [frame({ scalarFields: ["intensity"] })] });
    expect(result.current).toBe(first);

    rerender({ frames: [frame({ scalarFields: ["intensity", "ring"] })] });
    expect(result.current).not.toBe(first);
    expect(result.current.get("/lidar")?.scalarFields).toEqual([
      "intensity",
      "ring",
    ]);
  });
});

function frame({
  hasColors = false,
  scalarFields = [],
}: {
  readonly hasColors?: boolean;
  readonly scalarFields?: readonly string[];
}): EpisodeStreamPlaybackFrame<PointCloudVisualization> {
  return {
    ageNs: 0n,
    contentTimeNs: 0n,
    frame: {
      ...(hasColors ? { colors: new Float32Array(3) } : {}),
      ...(scalarFields.length
        ? {
            scalarFields: scalarFields.map((name) => ({
              name,
              values: new Float32Array(1),
            })),
          }
        : {}),
      fields: [],
      kind: VISUALIZATION_KIND.POINT_CLOUD,
      pointCount: 1,
      positions: new Float32Array([0, 0, 0]),
    },
    requestedTimeNs: 0n,
  };
}
