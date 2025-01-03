import { describe, expect, it } from "vitest";
import { ClassificationsOverlay } from "../overlays";
import { TemporalDetectionOverlay } from "../overlays/classifications";
import DetectionOverlay from "../overlays/detection";
import HeatmapOverlay from "../overlays/heatmap";
import KeypointOverlay from "../overlays/keypoint";
import PolylineOverlay from "../overlays/polyline";
import SegmentationOverlay from "../overlays/segmentation";
import type { Buffers } from "../state";
import { hasFrame, retrieveArrayBuffers } from "./utils";

describe("looker utilities", () => {
  it("determines frame availability given a buffer list", () => {
    const BUFFERS: Buffers = [
      [1, 3],
      [5, 25],
    ];
    for (const frameNumber of [1, 10, 25]) {
      expect(hasFrame(BUFFERS, frameNumber)).toBe(true);
    }

    for (const frameNumber of [0, 4, 26]) {
      expect(hasFrame(BUFFERS, frameNumber)).toBe(false);
    }
  });

  it("retrieves array buffers without errors", () => {
    expect(
      retrieveArrayBuffers([new ClassificationsOverlay([])])
    ).toStrictEqual([]);

    expect(
      retrieveArrayBuffers([new DetectionOverlay("ground_truth", {})])
    ).toStrictEqual([]);

    expect(
      retrieveArrayBuffers([
        new HeatmapOverlay("ground_truth", { id: "", tags: [] }),
      ])
    ).toStrictEqual([]);

    expect(
      retrieveArrayBuffers([new KeypointOverlay("ground_truth", {})])
    ).toStrictEqual([]);

    expect(
      retrieveArrayBuffers([
        new PolylineOverlay("ground_truth", {
          id: "",
          closed: false,
          filled: false,
          points: [],
          tags: [],
        }),
      ])
    ).toStrictEqual([]);

    expect(
      retrieveArrayBuffers([
        new SegmentationOverlay("ground_truth", { id: "", tags: [] }),
      ])
    ).toStrictEqual([]);

    expect(
      retrieveArrayBuffers([new TemporalDetectionOverlay([])])
    ).toStrictEqual([]);
  });
});
