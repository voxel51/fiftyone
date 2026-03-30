/**
 * Copyright 2017-2026, Voxel51, Inc.
 */
import { describe, expect, it } from "vitest";

import { extractZoomTarget } from "./utils";

const PRECISION = 10;

const det = (x: number, y: number, w: number, h: number) => ({
  _cls: "Detection",
  bounding_box: [x, y, w, h],
});

const approxRect = (x: number, y: number, w: number, h: number) => ({
  x: expect.closeTo(x, PRECISION),
  y: expect.closeTo(y, PRECISION),
  width: expect.closeTo(w, PRECISION),
  height: expect.closeTo(h, PRECISION),
});

const dets = (...boxes: ReturnType<typeof det>[]) => ({
  _cls: "Detections",
  detections: boxes,
});

describe("extractZoomTarget", () => {
  describe("returns null when no detections are present", () => {
    it("empty sample", () => {
      expect(extractZoomTarget({})).toBeNull();
    });

    it("sample with only non-label fields", () => {
      expect(
        extractZoomTarget({ filepath: "/img.jpg", tags: [], metadata: null })
      ).toBeNull();
    });

    it("Detections field with empty detections array", () => {
      expect(extractZoomTarget({ labels: dets() })).toBeNull();
    });

    it("DynamicEmbeddedDocument with no label fields", () => {
      expect(
        extractZoomTarget({
          embedded: { _cls: "DynamicEmbeddedDocument", score: 0.9 },
        })
      ).toBeNull();
    });
  });

  describe("top-level Detection", () => {
    it("returns the bounding box of a single Detection", () => {
      expect(
        extractZoomTarget({ ground_truth: det(0.1, 0.2, 0.3, 0.4) })
      ).toEqual(approxRect(0.1, 0.2, 0.3, 0.4));
    });
  });

  describe("top-level Detections", () => {
    it("returns the bounding box for a single detection", () => {
      expect(
        extractZoomTarget({ ground_truth: dets(det(0.1, 0.2, 0.3, 0.4)) })
      ).toEqual(approxRect(0.1, 0.2, 0.3, 0.4));
    });

    it("returns the union bounding box across multiple detections", () => {
      expect(
        extractZoomTarget({
          ground_truth: dets(det(0.0, 0.0, 0.2, 0.2), det(0.5, 0.5, 0.3, 0.3)),
        })
      ).toEqual(approxRect(0.0, 0.0, 0.8, 0.8));
    });
  });

  describe("multiple label fields", () => {
    it("returns the union across multiple top-level Detections fields", () => {
      expect(
        extractZoomTarget({
          ground_truth: dets(det(0.0, 0.0, 0.2, 0.2)),
          predictions: dets(det(0.6, 0.6, 0.2, 0.2)),
        })
      ).toEqual(approxRect(0.0, 0.0, 0.8, 0.8));
    });
  });

  describe("DynamicEmbeddedDocument wrapper (embedded fields)", () => {
    it("finds Detections nested inside a DynamicEmbeddedDocument", () => {
      expect(
        extractZoomTarget({
          embedded: {
            _cls: "DynamicEmbeddedDocument",
            detections: dets(det(0.1, 0.2, 0.3, 0.4)),
          },
        })
      ).toEqual(approxRect(0.1, 0.2, 0.3, 0.4));
    });

    it("finds a Detection nested inside a DynamicEmbeddedDocument", () => {
      expect(
        extractZoomTarget({
          embedded: {
            _cls: "DynamicEmbeddedDocument",
            box: det(0.1, 0.2, 0.3, 0.4),
          },
        })
      ).toEqual(approxRect(0.1, 0.2, 0.3, 0.4));
    });

    it("unions embedded detections with top-level detections", () => {
      expect(
        extractZoomTarget({
          ground_truth: dets(det(0.0, 0.0, 0.2, 0.2)),
          embedded: {
            _cls: "DynamicEmbeddedDocument",
            detections: dets(det(0.6, 0.6, 0.2, 0.2)),
          },
        })
      ).toEqual(approxRect(0.0, 0.0, 0.8, 0.8));
    });
  });

  describe("invalid / degenerate bounding boxes are ignored", () => {
    it("ignores detections with zero-width box", () => {
      expect(
        extractZoomTarget({ labels: dets(det(0.1, 0.2, 0.0, 0.4)) })
      ).toBeNull();
    });

    it("ignores detections with zero-height box", () => {
      expect(
        extractZoomTarget({ labels: dets(det(0.1, 0.2, 0.3, 0.0)) })
      ).toBeNull();
    });

    it("ignores detections with non-finite coordinates", () => {
      expect(
        extractZoomTarget({
          labels: dets({ _cls: "Detection", bounding_box: [NaN, 0, 0.3, 0.4] }),
        })
      ).toBeNull();
    });

    it("ignores detections with a missing bounding_box", () => {
      expect(
        extractZoomTarget({ labels: dets({ _cls: "Detection" } as never) })
      ).toBeNull();
    });

    it("uses only valid detections when mixed with invalid ones", () => {
      expect(
        extractZoomTarget({
          labels: dets(
            det(0.1, 0.2, 0.3, 0.4),
            { _cls: "Detection", bounding_box: [NaN, 0, 0.5, 0.5] }
          ),
        })
      ).toEqual(approxRect(0.1, 0.2, 0.3, 0.4));
    });
  });
});
