/**
 * Copyright 2017-2026, Voxel51, Inc.
 *
 * Pool enumeration at clip scale. A spread into a call passes every element
 * as an argument, and V8 throws `RangeError: Maximum call stack size
 * exceeded` a little past 100k arguments — below one seven-minute clip at
 * eleven boxes a frame.
 */

import type { LabelData } from "@fiftyone/utilities";
import { LabelType } from "@fiftyone/utilities";
import { describe, expect, test } from "vitest";

import { FrameStore, type FramesData } from "../store/frameStore";
import { AnnotationEngine } from "./engine";

const PATH = "frames.detections";

const clip = (frameCount: number, perFrame: number): FramesData => {
  const data: FramesData = {};

  for (let frame = 1; frame <= frameCount; frame++) {
    data[frame] = {
      [PATH]: Array.from(
        { length: perFrame },
        (_, slot): LabelData => ({
          _id: `d-${frame}-${slot}`,
          _cls: "Detection",
          instance: { _id: `inst-${slot}`, _cls: "Instance" },
          bounding_box: [0, 0, 0.1, 0.1],
        }),
      ),
    };
  }

  return data;
};

const engineOver = (frameCount: number, perFrame: number) => {
  const engine = new AnnotationEngine();
  engine.registerStore(
    new FrameStore("v", {
      labelTypes: { [PATH]: LabelType.Detections },
      data: clip(frameCount, perFrame),
    }),
  );
  return engine;
};

describe("engine.enumerateLabels at clip scale", () => {
  test("a 2-minute clip (3,600 frames x 11 boxes) enumerates", () => {
    expect(
      engineOver(3_600, 11).enumerateLabels([LabelType.Detections]),
    ).toHaveLength(39_600);
  });

  test("a 7-minute clip (12,588 frames x 11 boxes) enumerates without throwing", () => {
    expect(
      engineOver(12_588, 11).enumerateLabels([LabelType.Detections]),
    ).toHaveLength(138_468);
  });
});
