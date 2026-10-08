import type { Field } from "@fiftyone/utilities";
import {
  DETECTION,
  DETECTIONS,
  EMBEDDED_DOCUMENT_FIELD,
  LABELS_PATH,
  POLYLINES,
  withPath,
} from "@fiftyone/utilities";
import { describe, expect, it } from "vitest";
import { getFilterItemsProps } from "./useFilterData";

const labelField = (cls: string): Field => ({
  dbField: "ground_truth",
  description: null,
  embeddedDocType: withPath(LABELS_PATH, cls),
  ftype: EMBEDDED_DOCUMENT_FIELD,
  info: null,
  name: "ground_truth",
  path: "ground_truth",
  subfield: null,
});

const noSkeleton = () => null;

describe("getFilterItemsProps", () => {
  it("adds a bounding box row for a Detections field", () => {
    const items = getFilterItemsProps(
      "#ffffff",
      "ground_truth.detections",
      false,
      labelField(DETECTIONS),
      [],
      noSkeleton,
      "ground_truth",
    );

    expect(items).toContainEqual(
      expect.objectContaining({
        ftype: "_BOUNDING_BOX",
        labelPath: "ground_truth",
        path: "ground_truth.detections.bounding_box",
      }),
    );
  });

  it("adds a bounding box row for a Detection field", () => {
    const items = getFilterItemsProps(
      "#ffffff",
      "ground_truth",
      false,
      labelField(DETECTION),
      [],
      noSkeleton,
      "ground_truth",
    );

    expect(items).toContainEqual(
      expect.objectContaining({
        ftype: "_BOUNDING_BOX",
        labelPath: "ground_truth",
        path: "ground_truth.bounding_box",
      }),
    );
  });

  it("keys a frame field's bounding box row by its frames path", () => {
    // frame overlays are keyed "frames.<field>", so the row must be too
    const items = getFilterItemsProps(
      "#ffffff",
      "frames.ground_truth.detections",
      false,
      labelField(DETECTIONS),
      [],
      noSkeleton,
      "frames.ground_truth",
    );

    expect(items).toContainEqual(
      expect.objectContaining({
        ftype: "_BOUNDING_BOX",
        labelPath: "frames.ground_truth",
      }),
    );
  });

  it("adds no bounding box row for other label fields", () => {
    const items = getFilterItemsProps(
      "#ffffff",
      "ground_truth.polylines",
      false,
      labelField(POLYLINES),
      [],
      noSkeleton,
      "ground_truth",
    );

    expect(items.map(({ ftype }) => ftype)).not.toContain("_BOUNDING_BOX");
  });
});
