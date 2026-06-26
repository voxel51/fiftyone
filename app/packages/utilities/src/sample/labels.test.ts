import { describe, expect, it } from "vitest";
import {
  embeddedDocTypeToLabelType,
  isListLabelType,
  LabelType,
  LIST_LABEL_CHILD,
} from "./labels";

describe("isListLabelType", () => {
  it("is true for list labels", () => {
    for (const t of [
      LabelType.Classifications,
      LabelType.Detections,
      LabelType.Keypoints,
      LabelType.Polylines,
      LabelType.TemporalDetections,
    ]) {
      expect(isListLabelType(t)).toBe(true);
    }
  });

  it("is false for single labels and Unknown", () => {
    for (const t of [
      LabelType.Classification,
      LabelType.Detection,
      LabelType.Keypoint,
      LabelType.Polyline,
      LabelType.Unknown,
    ]) {
      expect(isListLabelType(t)).toBe(false);
    }
  });
});

describe("LIST_LABEL_CHILD", () => {
  it("maps each list label to its element-array key", () => {
    expect(LIST_LABEL_CHILD[LabelType.Detections]).toBe("detections");
    expect(LIST_LABEL_CHILD[LabelType.Classifications]).toBe("classifications");
    expect(LIST_LABEL_CHILD[LabelType.Keypoints]).toBe("keypoints");
    expect(LIST_LABEL_CHILD[LabelType.Polylines]).toBe("polylines");
    expect(LIST_LABEL_CHILD[LabelType.TemporalDetections]).toBe("detections");
  });

  it("has no entry for single labels", () => {
    expect(LIST_LABEL_CHILD[LabelType.Detection]).toBeUndefined();
  });
});

describe("embeddedDocTypeToLabelType", () => {
  it("resolves known embedded-doc types", () => {
    expect(embeddedDocTypeToLabelType("fiftyone.core.labels.Detections")).toBe(
      LabelType.Detections,
    );
    expect(embeddedDocTypeToLabelType("fiftyone.core.labels.Keypoint")).toBe(
      LabelType.Keypoint,
    );
    expect(
      embeddedDocTypeToLabelType("fiftyone.core.labels.TemporalDetections"),
    ).toBe(LabelType.TemporalDetections);
  });

  it("falls back to Unknown for unrecognized or empty input", () => {
    expect(embeddedDocTypeToLabelType("fiftyone.core.labels.Heatmap")).toBe(
      LabelType.Unknown,
    );
    expect(embeddedDocTypeToLabelType(null)).toBe(LabelType.Unknown);
    expect(embeddedDocTypeToLabelType(undefined)).toBe(LabelType.Unknown);
    expect(embeddedDocTypeToLabelType("")).toBe(LabelType.Unknown);
  });
});
