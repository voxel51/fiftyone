import { describe, expect, it } from "vitest";
import {
  canTransformArchetypeUseMode,
  getSelectedTransformArchetype,
} from "./transform-archetype";

const selectedCuboid = {
  _id: "cuboid-id",
  _cls: "Detection",
  dimensions: [1, 2, 3],
  location: [4, 5, 6],
};

const selectedPolyline = {
  _id: "polyline-id",
  _cls: "Polyline",
  points3d: [[[0, 0, 0]]],
};

describe("transform shortcuts", () => {
  it("derives the selected transform target from the selected thing", () => {
    expect(
      getSelectedTransformArchetype({
        currentArchetypeSelectedForTransform: null,
        selectedLabelForAnnotation: selectedCuboid,
      }),
    ).toBe("cuboid");
    expect(
      getSelectedTransformArchetype({
        currentArchetypeSelectedForTransform: "point",
        selectedLabelForAnnotation: selectedCuboid,
        selectedPoint: null,
      }),
    ).toBe("cuboid");
    expect(
      getSelectedTransformArchetype({
        currentArchetypeSelectedForTransform: "point",
        selectedLabelForAnnotation: selectedPolyline,
        selectedPoint: {
          labelId: "polyline-id",
          segmentIndex: 0,
          pointIndex: 0,
        },
      }),
    ).toBe("point");
    expect(
      getSelectedTransformArchetype({
        currentArchetypeSelectedForTransform: "annotation-plane",
        isAnnotationPlaneEnabled: true,
        selectedLabelForAnnotation: null,
      }),
    ).toBe("annotation-plane");
  });

  it("only enables shortcuts for modes supported by the selected target", () => {
    expect(canTransformArchetypeUseMode("cuboid", "translate")).toBe(true);
    expect(canTransformArchetypeUseMode("cuboid", "rotate")).toBe(true);
    expect(canTransformArchetypeUseMode("cuboid", "scale")).toBe(true);

    expect(canTransformArchetypeUseMode("annotation-plane", "translate")).toBe(
      true,
    );
    expect(canTransformArchetypeUseMode("annotation-plane", "rotate")).toBe(
      true,
    );
    expect(canTransformArchetypeUseMode("annotation-plane", "scale")).toBe(
      false,
    );

    expect(canTransformArchetypeUseMode("point", "translate")).toBe(true);
    expect(canTransformArchetypeUseMode("point", "rotate")).toBe(false);
    expect(canTransformArchetypeUseMode("polyline", "translate")).toBe(true);
    expect(canTransformArchetypeUseMode(null, "translate")).toBe(false);
  });
});
