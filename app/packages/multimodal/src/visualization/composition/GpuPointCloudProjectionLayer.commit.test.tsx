import { cleanup, render } from "@testing-library/react";
import { Component, type ReactNode } from "react";
import * as THREE from "three";
import { afterEach, describe, expect, it, vi } from "vitest";

import { buildPointCloudRenderPayload } from "../../runtime/point-cloud-render-payload";
import { GraphicsRuntimeProvider } from "../webgpu/graphics-runtime-context";
import { resolveGpuPointCloudColor } from "../scene-3d/gpu/gpu-point-cloud-color";
import { GpuPointCloudProjectionLayer } from "./GpuPointCloudProjectionLayer";
import {
  getGpuPointCloudProjectionResource,
  resetGpuPointCloudProjectionResourcesForTests,
} from "./gpu-point-cloud-projection-resources";

vi.mock("@react-three/fiber", () => ({
  useThree: (selector: (state: unknown) => unknown) =>
    selector({
      invalidate: vi.fn(),
      size: { height: 100, width: 100 },
    }),
}));

afterEach(() => {
  cleanup();
  resetGpuPointCloudProjectionResourcesForTests();
  vi.restoreAllMocks();
});

describe("GpuPointCloudProjectionLayer commit lifecycle", () => {
  it("does not mutate shared WebGL resources during an abandoned render", () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const suppressExpectedRenderError = (event: ErrorEvent) =>
      event.preventDefault();
    window.addEventListener("error", suppressExpectedRenderError);
    const payload = buildPointCloudRenderPayload({
      colors: new Float32Array([1, 0, 0]),
      positions: new Float32Array([0, 0, 1]),
    });
    const resource = getGpuPointCloudProjectionResource({
      contentKey: "aborted-frame",
      payload,
      streamKey: "points",
    });

    try {
      render(
        <RenderBoundary>
          <GraphicsRuntimeProvider
            runtime={{ backend: "webgl2", surface: "test" }}
          >
            <GpuPointCloudProjectionLayer
              calibrationHeight={100}
              calibrationWidth={100}
              color={resolveGpuPointCloudColor(payload, { colorBy: "rgb" })}
              fit="contain"
              imageHeight={100}
              imageWidth={100}
              pointSize={2}
              projection={{
                kind: "pinhole",
                projectionMatrix: new THREE.Matrix4(),
              }}
              resource={resource}
            />
            <AbandonRender />
          </GraphicsRuntimeProvider>
        </RenderBoundary>,
      );
    } finally {
      window.removeEventListener("error", suppressExpectedRenderError);
    }

    expect(
      resource.geometry.getAttribute("projectionWebGlColor"),
    ).toBeUndefined();
  });
});

function AbandonRender(): never {
  throw new Error("abandon this render");
}

class RenderBoundary extends Component<
  { readonly children: ReactNode },
  { readonly failed: boolean }
> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  render() {
    return this.state.failed ? null : this.props.children;
  }
}
