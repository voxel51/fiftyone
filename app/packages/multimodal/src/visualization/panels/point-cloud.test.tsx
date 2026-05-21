import { cleanup, render } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import * as THREE from "three";
import { VISUALIZATION_KIND } from "../visualization-registry";
import { PointCloudPanel } from "./point-cloud";

vi.mock("@react-three/fiber", () => ({
  useThree: () => vi.fn(),
}));

vi.mock("./base-3d-scene", () => ({
  Base3DScene: ({ children }: { readonly children?: ReactNode }) => (
    <>{children}</>
  ),
}));

vi.mock("./webgpu-canvas", () => ({
  WebGpuCanvas: ({ children }: { readonly children?: ReactNode }) => (
    <div>{children}</div>
  ),
}));

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("PointCloudPanel", () => {
  it("applies a frame transform before rendering point positions", () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const setAttribute = vi.spyOn(
      THREE.BufferGeometry.prototype,
      "setAttribute"
    );

    render(
      <PointCloudPanel
        frame={{
          fields: [],
          kind: VISUALIZATION_KIND.POINT_CLOUD,
          pointCount: 1,
          positions: new Float32Array([1, 2, 3]),
        }}
        frameTransform={{
          rotation: { w: 1, x: 0, y: 0, z: 0 },
          sourceFrameId: "lidar",
          targetFrameId: "map",
          translation: { x: 10, y: 0, z: 0 },
        }}
        showHud={false}
      />
    );

    const positionCall = setAttribute.mock.calls.find(
      ([attributeName]) => attributeName === "position"
    );
    const positionAttribute = positionCall?.[1] as
      | THREE.BufferAttribute
      | undefined;

    expect(positionAttribute).toBeDefined();
    expect(Array.from(positionAttribute?.array ?? [])).toEqual([11, 3, -2]);
  });
});
