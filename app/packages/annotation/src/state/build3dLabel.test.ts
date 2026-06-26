import type {
  ReconciledDetection3D,
  ReconciledPolyline3D,
} from "@fiftyone/looker-3d";
import { describe, expect, it } from "vitest";
import { build3dLabel } from "./build3dLabel";

const baseDetection = (
  overrides: Partial<ReconciledDetection3D> = {},
): ReconciledDetection3D =>
  ({
    _id: "det-1",
    _cls: "Detection",
    type: "Detection",
    path: "ground_truth_3d",
    label: "car",
    location: [1, 2, 3],
    dimensions: [4, 5, 6],
    rotation: [0, 0, 0],
    quaternion: [0, 0, 0, 1],
    tags: [],
    sampleId: "sample-1",
    color: "#ff0000",
    selected: false,
    isNew: false,
    ...overrides,
  }) as unknown as ReconciledDetection3D;

const basePolyline = (
  overrides: Partial<ReconciledPolyline3D> = {},
): ReconciledPolyline3D =>
  ({
    _id: "poly-1",
    _cls: "Polyline",
    type: "Polyline",
    path: "polylines_3d",
    label: "lane",
    points3d: [
      [
        [0, 0, 0],
        [1, 1, 1],
      ],
    ],
    closed: true,
    filled: false,
    tags: [],
    sampleId: "sample-1",
    color: "#00ff00",
    selected: false,
    isNew: true,
    ...overrides,
  }) as unknown as ReconciledPolyline3D;

describe("build3dLabel", () => {
  it("strips internal/reserved attributes from a detection", () => {
    const result = build3dLabel(baseDetection());

    expect(result).toBeDefined();
    // reserved attributes are gone
    for (const key of [
      "color",
      "id",
      "isNew",
      "path",
      "selected",
      "sampleId",
      "type",
    ]) {
      expect(result).not.toHaveProperty(key);
    }
    // persistable fields are kept
    expect(result).toMatchObject({
      _id: "det-1",
      _cls: "Detection",
      label: "car",
      location: [1, 2, 3],
      dimensions: [4, 5, 6],
      rotation: [0, 0, 0],
      quaternion: [0, 0, 0, 1],
      tags: [],
    });
  });

  it("keeps polyline-specific fields", () => {
    const result = build3dLabel(basePolyline());

    expect(result).toMatchObject({
      _id: "poly-1",
      _cls: "Polyline",
      label: "lane",
      points3d: [
        [
          [0, 0, 0],
          [1, 1, 1],
        ],
      ],
      closed: true,
      filled: false,
    });
    expect(result).not.toHaveProperty("color");
    expect(result).not.toHaveProperty("isNew");
  });

  it("persists a label without a `label` value (no requireLabel gate)", () => {
    expect(build3dLabel(baseDetection({ label: "" }))).toMatchObject({
      _id: "det-1",
      _cls: "Detection",
      label: "",
    });
    expect(
      build3dLabel(baseDetection({ label: undefined as unknown as string })),
    ).toMatchObject({ _id: "det-1", _cls: "Detection" });
  });

  it("returns undefined for an unsupported _cls", () => {
    expect(
      build3dLabel(
        baseDetection({ _cls: "Classification" as unknown as "Detection" }),
      ),
    ).toBeUndefined();
  });

  it("does not mutate the source label", () => {
    const label = baseDetection();
    build3dLabel(label);
    expect(label).toHaveProperty("color", "#ff0000");
    expect(label).toHaveProperty("path", "ground_truth_3d");
  });
});
