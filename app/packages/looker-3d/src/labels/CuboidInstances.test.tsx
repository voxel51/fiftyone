import { cleanup, render, renderHook } from "@testing-library/react";
import { Children, isValidElement, type ReactNode } from "react";
import { Color } from "three";
import type { LineSegmentsGeometry } from "three/examples/jsm/lines/LineSegmentsGeometry";
import { afterEach, expect, it, vi } from "vitest";
import type { ReconciledDetection3D } from "../annotation/types";
import { CuboidInstances, type CuboidInstancesProps } from "./CuboidInstances";

vi.mock("../state/accessors", () => ({
  useHoveredLabel3d: () => null,
  useIsCurrentlyTransforming: () => false,
  useSetHoveredLabel3d: () => vi.fn(),
  useCurrentSelected3dAnnotationLabel: () => null,
}));
vi.mock("../hooks/use-similar-labels-3d", () => ({
  useSimilarLabels3d: () => false,
}));
vi.mock("../utils", () => ({
  getComplementaryColor: () => "#ffffff",
}));
vi.mock("./shared/hooks", () => ({
  useEventHandlers: () => ({}),
}));
vi.mock("./shared/registerLineElements", () => ({}));

afterEach(cleanup);

// Run the batch's real hooks and headless color children without mounting
// WebGL hosts. Geometry and color buffers are real Three.js objects.
function colorChildren(tree: ReactNode) {
  if (!isValidElement<{ children: ReactNode }>(tree)) {
    throw new Error("Expected a cuboid batch");
  }
  return Children.toArray(tree.props.children).filter(
    (child) =>
      isValidElement<{
        label: ReconciledDetection3D;
        outlineGeometry: LineSegmentsGeometry;
      }>(child) &&
      typeof child.type === "function" &&
      "outlineGeometry" in child.props,
  );
}

it("updates selection colors without rebuilding geometry when label IDs stay unchanged", () => {
  const label: ReconciledDetection3D = {
    data: {
      _id: "car",
      _cls: "Detection",
      location: [0, 0, 0],
      dimensions: [2, 4, 2],
    },
    sampleId: "sample",
    path: "ground_truth",
    ui: { selected: false },
  };
  const props: CuboidInstancesProps = {
    detections: [label],
    getColor: () => "#0000ff",
    opacity: 0.5,
    lineWidth: 2,
    useLegacyCoordinates: false,
    overlayRotationFallback: [0, 0, 0],
    onClick: vi.fn(),
  };
  const batch = renderHook(CuboidInstances, { initialProps: props });
  const colors = render(<>{colorChildren(batch.result.current)}</>);
  const child = colorChildren(batch.result.current)[0];
  if (!isValidElement<{ outlineGeometry: LineSegmentsGeometry }>(child)) {
    throw new Error("Expected a color renderer");
  }
  const geometry = child.props.outlineGeometry;
  const positions = geometry.attributes.instanceStart;

  const expectColor = (hex: string) => {
    const expected = new Color(hex);
    const actual = geometry.attributes.instanceColorStart;
    expect(actual.getX(0)).toBeCloseTo(expected.r);
    expect(actual.getY(0)).toBeCloseTo(expected.g);
    expect(actual.getZ(0)).toBeCloseTo(expected.b);
  };
  expectColor("#0000ff");

  for (const selected of [true, false]) {
    batch.rerender({
      ...props,
      detections: [{ ...label, ui: { selected } }],
    });
    const updated = colorChildren(batch.result.current)[0];
    if (!isValidElement<{ outlineGeometry: LineSegmentsGeometry }>(updated)) {
      throw new Error("Expected a color renderer");
    }
    expect(updated.props.outlineGeometry).toBe(geometry);
    expect(geometry.attributes.instanceStart).toBe(positions);
    colors.rerender(<>{colorChildren(batch.result.current)}</>);
    expectColor(selected ? "#ffa500" : "#0000ff");
  }
});
