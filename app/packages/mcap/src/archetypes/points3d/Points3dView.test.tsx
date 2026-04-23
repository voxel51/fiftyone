/**
 * @vitest-environment jsdom
 */
import { cleanup, render, screen } from "@testing-library/react";
import React from "react";
import * as THREE from "three";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const {
  fitPerspectiveCameraToBoundsMock,
  cameraRef,
  invalidateMock,
  controlsRef,
} = vi.hoisted(() => ({
  fitPerspectiveCameraToBoundsMock: vi.fn(),
  cameraRef: {
    current: null as THREE.PerspectiveCamera | null,
  },
  invalidateMock: vi.fn(),
  controlsRef: {
    current: null as {
      target: THREE.Vector3;
      update: ReturnType<typeof vi.fn>;
    } | null,
  },
}));

vi.mock("./helpers", async () => {
  const actual = await vi.importActual<typeof import("./helpers")>("./helpers");

  return {
    ...actual,
    fitPerspectiveCameraToBounds: fitPerspectiveCameraToBoundsMock,
  };
});

vi.mock("@react-three/fiber", () => ({
  useThree: () => ({
    camera: cameraRef.current as THREE.PerspectiveCamera,
    invalidate: invalidateMock,
  }),
}));

vi.mock("../../WebGpuCanvas", () => ({
  WebGpuCanvas: ({
    children,
    ...props
  }: React.PropsWithChildren<Record<string, unknown>>) => (
    <div data-testid="points3d-canvas" data-props={JSON.stringify(props)}>
      {children}
    </div>
  ),
}));

vi.mock("@react-three/drei", () => ({
  GizmoHelper: ({
    children,
    ...props
  }: React.PropsWithChildren<Record<string, unknown>>) => (
    <div data-testid="points3d-gizmo-helper" data-props={JSON.stringify(props)}>
      {children}
    </div>
  ),
  GizmoViewport: (props: Record<string, unknown>) => (
    <div
      data-testid="points3d-gizmo-viewport"
      data-props={JSON.stringify(props)}
    />
  ),
  Grid: (props: Record<string, unknown>) => (
    <div data-testid="points3d-grid" data-props={JSON.stringify(props)} />
  ),
  OrbitControls: React.forwardRef((_props, ref) => {
    const controls = controlsRef.current ?? {
      target: new THREE.Vector3(),
      update: vi.fn(),
    };
    controlsRef.current = controls;

    if (typeof ref === "function") {
      ref(controls);
    } else if (ref) {
      ref.current = controls;
    }

    return <div data-testid="points3d-controls" />;
  }),
}));

const { Points3dView } = await import("./Points3dView");

const FRAME = {
  id: "cloud-1",
  pointCount: 2,
  bounds: {
    min: [0, 0, 0] as [number, number, number],
    max: [1, 2, 3] as [number, number, number],
  },
  primitives: [
    {
      kind: "points",
      id: "points",
      frameId: "map",
      pointCount: 2,
      positions: new Float32Array([0, 0, 0, 1, 2, 3]),
      intensity: new Float32Array([0.1, 0.9]),
      colors: null,
      solidColor: null,
      pointSize: null,
    },
  ],
};

describe("Points3dView", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    cameraRef.current = new THREE.PerspectiveCamera(50, 1, 0.01, 1000);
    controlsRef.current = null;
  });

  afterEach(() => {
    cleanup();
  });

  it("renders a point cloud frame", () => {
    const { container } = render(<Points3dView frame={FRAME} />);
    const grid = screen.getByTestId("points3d-grid");
    const gridProps = JSON.parse(grid.getAttribute("data-props") ?? "{}");
    const gizmoHelper = screen.getByTestId("points3d-gizmo-helper");
    const gizmoHelperProps = JSON.parse(
      gizmoHelper.getAttribute("data-props") ?? "{}"
    );

    expect(screen.getByTestId("points3d-view")).toBeTruthy();
    expect(screen.getByTestId("points3d-canvas")).toBeTruthy();
    expect(screen.getByTestId("points3d-controls")).toBeTruthy();
    expect(gizmoHelper).toBeTruthy();
    expect(screen.getByTestId("points3d-gizmo-viewport")).toBeTruthy();
    expect(grid).toBeTruthy();
    expect(gridProps.args).toEqual([16, 16]);
    expect(gridProps.cellSize).toBe(0.1);
    expect(gridProps.sectionSize).toBe(1);
    expect(gridProps.infiniteGrid).toBe(true);
    expect(gridProps.followCamera).toBeUndefined();
    expect(gridProps.fadeDistance).toBe(80);
    expect(gridProps.fadeFrom).toBe(0.4);
    expect(gridProps.position).toEqual([0, 0, 0]);
    expect(gizmoHelperProps.alignment).toBe("top-left");
    expect(gizmoHelperProps.margin).toEqual([52, 50]);
    expect(container.querySelector("gridhelper")).toBeNull();
  });

  it("anchors the grid plane to the snapped scene floor", () => {
    render(
      <Points3dView
        frame={{
          ...FRAME,
          bounds: {
            min: [2, -3, 17],
            max: [10, 12, 28],
          },
        }}
      />
    );

    const grid = screen.getByTestId("points3d-grid");
    const gridProps = JSON.parse(grid.getAttribute("data-props") ?? "{}");

    expect(gridProps.sectionSize).toBe(10);
    expect(gridProps.position).toEqual([0, 0, 10]);
  });

  it("rotates the grid helper for x-up scenes", () => {
    render(<Points3dView frame={FRAME} upAxis="x" />);

    const grid = screen.getByTestId("points3d-grid");
    const gridProps = JSON.parse(grid.getAttribute("data-props") ?? "{}");

    expect(gridProps.rotation).toEqual([0, 0, Math.PI / 2]);
  });

  it("keeps the grid stationary across playback updates", () => {
    const { rerender } = render(
      <Points3dView
        followPose={{
          position: [0, 0, 0],
          orientation: null,
        }}
        frame={FRAME}
      />
    );

    rerender(
      <Points3dView
        followPose={{
          position: [120, -40, 35],
          orientation: null,
        }}
        frame={{
          ...FRAME,
          bounds: {
            min: [100, -20, 22],
            max: [112, -8, 34],
          },
        }}
      />
    );

    const grid = screen.getByTestId("points3d-grid");
    const gridProps = JSON.parse(grid.getAttribute("data-props") ?? "{}");

    expect(gridProps.position).toEqual([0, 0, 0]);
    expect(gridProps.sectionSize).toBe(10);
  });

  it("reanchors the grid when the reset token changes", () => {
    const { rerender } = render(
      <Points3dView frame={FRAME} resetViewToken="panel-a" />
    );

    rerender(
      <Points3dView
        frame={{
          ...FRAME,
          bounds: {
            min: [2, -3, 17],
            max: [10, 12, 28],
          },
        }}
        resetViewToken="panel-b"
      />
    );

    const grid = screen.getByTestId("points3d-grid");
    const gridProps = JSON.parse(grid.getAttribute("data-props") ?? "{}");

    expect(gridProps.position).toEqual([0, 0, 10]);
  });

  it("fits the camera only once across frame updates when view is preserved", () => {
    const { rerender } = render(<Points3dView frame={FRAME} />);

    rerender(
      <Points3dView
        frame={{
          ...FRAME,
          id: "cloud-2",
          primitives: [
            {
              ...FRAME.primitives[0],
              positions: new Float32Array([0, 0, 0, 2, 3, 4]),
            },
          ],
        }}
      />
    );

    expect(fitPerspectiveCameraToBoundsMock).toHaveBeenCalledTimes(1);
  });

  it("refits the camera when the reset token changes", () => {
    const { rerender } = render(
      <Points3dView frame={FRAME} resetViewToken="reset-1" />
    );

    rerender(<Points3dView frame={FRAME} resetViewToken="reset-2" />);

    expect(fitPerspectiveCameraToBoundsMock).toHaveBeenCalledTimes(2);
  });

  it("preserves the user's zoom while follow pose updates", () => {
    const { rerender } = render(
      <Points3dView
        followPose={{
          position: [10, 0, 0],
          orientation: [0, 0, 0, 1],
        }}
        frame={FRAME}
      />
    );

    expect(controlsRef.current).not.toBeNull();
    cameraRef.current.position.set(13, 0, 2);
    controlsRef.current?.target.set(10, 0, 0);

    rerender(
      <Points3dView
        followPose={{
          position: [12, 0, 0],
          orientation: [0, 0, 0, 1],
        }}
        frame={FRAME}
      />
    );

    expect(cameraRef.current.position.toArray()).toEqual([15, 0, 2]);
    expect(controlsRef.current?.target.toArray()).toEqual([12, 0, 0]);
  });

  it("rotates the preserved camera offset with ego orientation updates", () => {
    const { rerender } = render(
      <Points3dView
        followPose={{
          position: [0, 0, 0],
          orientation: [0, 0, 0, 1],
        }}
        frame={FRAME}
      />
    );

    expect(controlsRef.current).not.toBeNull();
    cameraRef.current.position.set(0, -8, 4);
    controlsRef.current?.target.set(0, 0, 0);

    rerender(
      <Points3dView
        followPose={{
          position: [5, 1, 0],
          orientation: [0, 0, Math.sin(Math.PI / 4), Math.cos(Math.PI / 4)],
        }}
        frame={FRAME}
      />
    );

    expect(cameraRef.current.position.x).toBeCloseTo(13);
    expect(cameraRef.current.position.y).toBeCloseTo(1);
    expect(cameraRef.current.position.z).toBeCloseTo(4);
    expect(controlsRef.current?.target.toArray()).toEqual([5, 1, 0]);
  });
});
