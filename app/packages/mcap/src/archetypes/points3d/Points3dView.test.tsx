/**
 * @vitest-environment jsdom
 */
import { cleanup, render, screen } from "@testing-library/react";
import React from "react";
import * as THREE from "three";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Points3dView } from "./Points3dView";

const { fitPerspectiveCameraToBoundsMock } = vi.hoisted(() => ({
  fitPerspectiveCameraToBoundsMock: vi.fn(),
}));

vi.mock("./helpers", async () => {
  const actual = await vi.importActual<typeof import("./helpers")>("./helpers");

  return {
    ...actual,
    fitPerspectiveCameraToBounds: fitPerspectiveCameraToBoundsMock,
  };
});

vi.mock("@react-three/fiber", () => ({
  Canvas: ({
    children,
    ...props
  }: React.PropsWithChildren<Record<string, unknown>>) => (
    <div data-testid="points3d-canvas" data-props={JSON.stringify(props)}>
      {children}
    </div>
  ),
  useThree: () => ({
    camera: new THREE.PerspectiveCamera(50, 1, 0.01, 1000),
    invalidate: vi.fn(),
  }),
}));

vi.mock("@react-three/drei", () => ({
  OrbitControls: React.forwardRef((_props, ref) => {
    const controls = {
      target: new THREE.Vector3(),
      update: vi.fn(),
    };

    if (typeof ref === "function") {
      ref(controls);
    } else if (ref) {
      ref.current = controls;
    }

    return <div data-testid="points3d-controls" />;
  }),
}));

const FRAME = {
  id: "cloud-1",
  pointCount: 2,
  positions: new Float32Array([0, 0, 0, 1, 2, 3]),
  intensity: new Float32Array([0.1, 0.9]),
  bounds: {
    min: [0, 0, 0] as [number, number, number],
    max: [1, 2, 3] as [number, number, number],
  },
};

describe("Points3dView", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    cleanup();
  });

  it("renders a point cloud frame", () => {
    render(<Points3dView frame={FRAME} />);

    expect(screen.getByTestId("points3d-view")).toBeTruthy();
    expect(screen.getByTestId("points3d-canvas")).toBeTruthy();
    expect(screen.getByTestId("points3d-controls")).toBeTruthy();
  });

  it("fits the camera only once across frame updates when view is preserved", () => {
    const { rerender } = render(<Points3dView frame={FRAME} />);

    rerender(
      <Points3dView
        frame={{
          ...FRAME,
          id: "cloud-2",
          positions: new Float32Array([0, 0, 0, 2, 3, 4]),
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
});
