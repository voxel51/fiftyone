import { cleanup, fireEvent, render } from "@testing-library/react";
import { createStore, Provider as JotaiProvider } from "jotai";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { RawImageVisualization } from "../../../decoders";
import { VISUALIZATION_KIND } from "../../../visualization";
import type { McapCameraModel } from "./camera-geometry/mcap-camera-model";
import McapDepthHoverOverlay from "./McapDepthHoverOverlay";
import { mcapDepthHoverAtom } from "./mcap-depth-hover";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("McapDepthHoverOverlay", () => {
  it("publishes the sampled image pixel and clears it on pointer leave", () => {
    const animationFrames: FrameRequestCallback[] = [];
    vi.spyOn(window, "requestAnimationFrame").mockImplementation((callback) => {
      animationFrames.push(callback);
      return animationFrames.length;
    });
    vi.spyOn(window, "cancelAnimationFrame").mockImplementation(
      () => undefined,
    );
    const store = createStore();
    const model = cameraModel();
    const { getByTestId } = render(
      <JotaiProvider store={store}>
        <div data-testid="surface">
          <McapDepthHoverOverlay
            cameraFrameId="camera"
            contentTimeNs={42n}
            displayCameraModel={model}
            fit="contain"
            frame={depthFrame()}
            imageTopic="/camera/depth"
            sourceCameraModel={model}
          />
        </div>
      </JotaiProvider>,
    );
    const surface = getByTestId("surface");
    vi.spyOn(surface, "getBoundingClientRect").mockReturnValue(
      boundingRect(100, 100),
    );

    fireEvent(
      surface,
      new MouseEvent("pointermove", {
        bubbles: true,
        clientX: 90,
        clientY: 50,
      }),
    );
    expect(animationFrames).toHaveLength(1);
    animationFrames.shift()?.(0);

    expect(store.get(mcapDepthHoverAtom)).toEqual({
      cameraFrameId: "camera",
      contentTimeNs: 42n,
      depthMeters: 2,
      imageTopic: "/camera/depth",
      pixel: [2, 1],
      position: [0.02, 0, 2],
    });

    fireEvent(surface, new MouseEvent("pointerleave"));
    expect(store.get(mcapDepthHoverAtom)).toBeNull();
  });

  it("withholds samples over contain-fit letterboxing", () => {
    const animationFrames: FrameRequestCallback[] = [];
    vi.spyOn(window, "requestAnimationFrame").mockImplementation((callback) => {
      animationFrames.push(callback);
      return animationFrames.length;
    });
    const store = createStore();
    const model = cameraModel();
    const { getByTestId } = render(
      <JotaiProvider store={store}>
        <div data-testid="surface">
          <McapDepthHoverOverlay
            cameraFrameId="camera"
            contentTimeNs={42n}
            displayCameraModel={model}
            fit="contain"
            frame={depthFrame()}
            imageTopic="/camera/depth"
            sourceCameraModel={model}
          />
        </div>
      </JotaiProvider>,
    );
    const surface = getByTestId("surface");
    vi.spyOn(surface, "getBoundingClientRect").mockReturnValue(
      boundingRect(200, 100),
    );

    fireEvent(
      surface,
      new MouseEvent("pointermove", {
        bubbles: true,
        clientX: 25,
        clientY: 50,
      }),
    );
    animationFrames.shift()?.(0);

    expect(store.get(mcapDepthHoverAtom)).toBeNull();
  });
});

function cameraModel(): McapCameraModel {
  return {
    height: 3,
    kind: "pinhole",
    projection: [100, 0, 1, 0, 0, 100, 1, 0, 0, 0, 1, 0],
    rectification: [1, 0, 0, 0, 1, 0, 0, 0, 1],
    space: "original",
    width: 3,
  };
}

function depthFrame(): RawImageVisualization {
  return {
    depth: {
      metersPerUnit: 0.001,
      values: new Uint16Array([0, 0, 0, 0, 0, 2_000, 0, 0, 0]),
    },
    height: 3,
    kind: VISUALIZATION_KIND.RAW_IMAGE,
    rgba: new Uint8Array(3 * 3 * 4),
    sourceEncoding: "16UC1",
    width: 3,
  };
}

function boundingRect(width: number, height: number): DOMRect {
  return {
    bottom: height,
    height,
    left: 0,
    right: width,
    toJSON: () => ({}),
    top: 0,
    width,
    x: 0,
    y: 0,
  };
}
