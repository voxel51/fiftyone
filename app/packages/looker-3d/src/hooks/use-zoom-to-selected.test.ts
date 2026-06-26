import { Box3, Vector3 } from "three";
import { describe, expect, it } from "vitest";
import type { RenderModel } from "../annotation/store";
import {
  createLabelBoundingBox,
  getSelectedLabelsBoundingBox,
  resolveAnnotationLabelBoundingBox,
} from "./zoom-to-selected-bounds";

const makeSample = (sample: Record<string, unknown>) =>
  ({
    id: sample._id,
    sample,
  }) as any;

const expectBox = (
  box: Box3 | null,
  {
    center,
    size,
  }: {
    center: [number, number, number];
    size: [number, number, number];
  },
) => {
  expect(box).not.toBeNull();

  const actualCenter = box!.getCenter(new Vector3()).toArray();
  const actualSize = box!.getSize(new Vector3()).toArray();

  for (let i = 0; i < 3; i++) {
    expect(actualCenter[i]).toBeCloseTo(center[i]);
    expect(actualSize[i]).toBeCloseTo(size[i]);
  }
};

describe("zoom-to-selected bounds", () => {
  it("crops to the selected polyline instead of the entire Polylines field", () => {
    const interactionSample = makeSample({
      _id: "sample-one",
      lanes: {
        polylines: [
          {
            _id: "near-polyline",
            _cls: "Polyline",
            points3d: [
              [
                [0, 0, 0],
                [2, 0, 0],
              ],
            ],
          },
          {
            _id: "far-polyline",
            _cls: "Polyline",
            points3d: [
              [
                [100, 0, 0],
                [102, 0, 0],
              ],
            ],
          },
        ],
      },
    });

    const box = getSelectedLabelsBoundingBox({
      selectedLabels: [
        {
          labelId: "near-polyline",
          field: "lanes",
          sampleId: "sample-one",
        },
      ],
      interactionSample,
      activeSampleMap: { left: interactionSample },
    });

    expectBox(box, {
      center: [1, 0, 0],
      size: [2, 0, 0],
    });
  });

  it("resolves selected labels from their active group sample", () => {
    const interactionSample = makeSample({
      _id: "left-sample",
      labels: {
        detections: [
          {
            _id: "left-box",
            _cls: "Detection",
            location: [0, 0, 0],
            dimensions: [1, 1, 1],
          },
        ],
      },
    });
    const rightSample = makeSample({
      _id: "right-sample",
      labels: {
        detections: [
          {
            _id: "right-box",
            _cls: "Detection",
            location: [10, 0, 0],
            dimensions: [2, 4, 6],
          },
        ],
      },
    });

    const box = getSelectedLabelsBoundingBox({
      selectedLabels: [
        {
          labelId: "right-box",
          field: "labels",
          sampleId: "right-sample",
        },
      ],
      interactionSample,
      activeSampleMap: {
        left: interactionSample,
        right: rightSample,
      },
    });

    expectBox(box, {
      center: [10, 0, 0],
      size: [2, 4, 6],
    });
  });

  it("does not choose an arbitrary label when selection id is missing", () => {
    const interactionSample = makeSample({
      _id: "sample-one",
      labels: {
        detections: [
          {
            _id: "first-box",
            _cls: "Detection",
            location: [0, 0, 0],
            dimensions: [1, 1, 1],
          },
          {
            _id: "second-box",
            _cls: "Detection",
            location: [10, 0, 0],
            dimensions: [1, 1, 1],
          },
        ],
      },
    });

    const box = getSelectedLabelsBoundingBox({
      selectedLabels: [
        {
          field: "labels",
          sampleId: "sample-one",
        },
      ],
      interactionSample,
      activeSampleMap: { left: interactionSample },
    });

    expect(box).toBeNull();
  });

  it("uses the interaction sample when active samples contain the same id", () => {
    const interactionSample = makeSample({
      _id: "sample-one",
      labels: {
        detections: [
          {
            _id: "selected-box",
            _cls: "Detection",
            location: [0, 0, 0],
            dimensions: [2, 2, 2],
          },
        ],
      },
    });
    const staleActiveSample = makeSample({
      _id: "sample-one",
      labels: {
        detections: [
          {
            _id: "selected-box",
            _cls: "Detection",
            location: [100, 0, 0],
            dimensions: [2, 2, 2],
          },
        ],
      },
    });

    const box = getSelectedLabelsBoundingBox({
      selectedLabels: [
        {
          labelId: "selected-box",
          field: "labels",
          sampleId: "sample-one",
        },
      ],
      interactionSample,
      activeSampleMap: { left: staleActiveSample },
    });

    expectBox(box, {
      center: [0, 0, 0],
      size: [2, 2, 2],
    });
  });

  it("uses the render model for annotation crop bounds", () => {
    const renderModel: RenderModel = {
      detections: [
        {
          _id: "moving-box",
          _cls: "Detection",
          path: "labels",
          location: [5, 0, 0],
          dimensions: [2, 2, 2],
        } as any,
      ],
      polylines: [],
    };

    const box = resolveAnnotationLabelBoundingBox({
      selectedLabel: {
        _id: "moving-box",
        path: "labels",
        location: [0, 0, 0],
        dimensions: [2, 2, 2],
      } as any,
      renderModel,
    });

    expectBox(box, {
      center: [5, 0, 0],
      size: [2, 2, 2],
    });
  });

  it("accounts for cuboid rotation when creating crop bounds", () => {
    const sinCos45 = Math.SQRT1_2;
    const box = createLabelBoundingBox({
      _cls: "Detection",
      _id: "rotated-box",
      location: [0, 0, 0],
      dimensions: [2, 4, 2],
      quaternion: [0, 0, sinCos45, sinCos45],
    });

    expectBox(box, {
      center: [0, 0, 0],
      size: [4, 2, 2],
    });
  });

  it("shifts legacy cuboid locations to the rendered center", () => {
    const box = createLabelBoundingBox(
      {
        _cls: "Detection",
        _id: "legacy-box",
        location: [0, 4, 0],
        dimensions: [2, 2, 2],
      },
      { useLegacyCoordinates: true },
    );

    expectBox(box, {
      center: [0, 3, 0],
      size: [2, 2, 2],
    });
  });
});
