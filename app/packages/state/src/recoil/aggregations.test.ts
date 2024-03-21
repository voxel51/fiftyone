import { describe, expect, it, vi } from "vitest";
vi.mock("recoil");
vi.mock("recoil-relay");

import { setMockAtoms, TestSelectorFamily } from "../../../../__mocks__/recoil";
import * as aggregations from "./aggregations";
import { State } from "./types";

describe("test aggregation path accumulation", () => {
  it("resolves grouped modal label paths", () => {
    const testModalSampleAggregationPaths = <
      TestSelectorFamily<typeof aggregations.modalAggregationPaths>
    >(<unknown>aggregations.modalAggregationPaths({
      path: "ground_truth.detections.one",
    }));
    setMockAtoms({
      expandPath: (path) => `${path}.detections`,
      modalFilterFields: (path) => [
        path,
        `${path}.one`,
        `${path}.two`,
        `${path}.numeric`,
      ],
      isNumericField: (path) => path.endsWith(".numeric"),
      labelFields: ({ space }) =>
        space === State.SPACE.SAMPLE
          ? ["ground_truth", "predictions"]
          : ["frames.frames_ground_truth", "frames.frames_predictions"],
      groupId: "groupId",
    });
    expect(testModalSampleAggregationPaths()).toStrictEqual([
      "ground_truth.detections",
      "ground_truth.detections.one",
      "ground_truth.detections.two",
      "predictions.detections",
      "predictions.detections.one",
      "predictions.detections.two",
    ]);

    const testModalSampleNumericAggregationPaths = <
      TestSelectorFamily<typeof aggregations.modalAggregationPaths>
    >(<unknown>aggregations.modalAggregationPaths({
      path: "ground_truth.detections.numeric",
    }));

    expect(testModalSampleNumericAggregationPaths()).toStrictEqual([
      "ground_truth.detections.numeric",
      "predictions.detections.numeric",
    ]);

    const testModalFrameAggregationPaths = <
      TestSelectorFamily<typeof aggregations.modalAggregationPaths>
    >(<unknown>aggregations.modalAggregationPaths({
      path: "frames.frames_ground_truth.detections.one",
    }));

    expect(testModalFrameAggregationPaths()).toStrictEqual([
      "frames.frames_ground_truth.detections",
      "frames.frames_ground_truth.detections.one",
      "frames.frames_ground_truth.detections.two",
      "frames.frames_predictions.detections",
      "frames.frames_predictions.detections.one",
      "frames.frames_predictions.detections.two",
    ]);

    const testModalFrameNumericAggregationPaths = <
      TestSelectorFamily<typeof aggregations.modalAggregationPaths>
    >(<unknown>aggregations.modalAggregationPaths({
      path: "frames.frames_ground_truth.detections.numeric",
    }));

    expect(testModalFrameNumericAggregationPaths()).toStrictEqual([
      "frames.frames_ground_truth.detections.numeric",
      "frames.frames_predictions.detections.numeric",
    ]);
  });
});
