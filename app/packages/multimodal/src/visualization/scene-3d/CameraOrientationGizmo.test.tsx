import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as THREE from "three";

const harness = vi.hoisted(() => ({
  camera: null as unknown as THREE.PerspectiveCamera,
  frame: null as ((state: { camera: THREE.PerspectiveCamera }) => void) | null,
  htmlRenderCount: 0,
}));

vi.mock("@react-three/fiber", () => ({
  useFrame: (
    callback: (state: { camera: THREE.PerspectiveCamera }) => void,
  ) => {
    harness.frame = callback;
  },
  useThree: (
    selector: (state: { camera: THREE.PerspectiveCamera }) => unknown,
  ) => selector({ camera: harness.camera }),
}));

vi.mock("@react-three/drei", () => ({
  Html: ({ children }: { readonly children?: ReactNode }) => {
    harness.htmlRenderCount += 1;
    return children;
  },
}));

import { CameraOrientationGizmo } from "./CameraOrientationGizmo";

beforeEach(() => {
  harness.camera = new THREE.PerspectiveCamera();
  harness.frame = null;
  harness.htmlRenderCount = 0;
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("CameraOrientationGizmo", () => {
  it("exposes clickable positive and negative world axes", () => {
    const onDirection = vi.fn();
    render(<CameraOrientationGizmo onDirection={onDirection} />);

    fireEvent.click(
      screen.getByRole("button", { name: "View from positive X axis" }),
    );
    fireEvent.click(
      screen.getByRole("button", { name: "View from negative Z axis" }),
    );

    expect(onDirection).toHaveBeenNthCalledWith(1, [1, 0, 0]);
    expect(onDirection).toHaveBeenNthCalledWith(2, [0, 0, -1]);
  });

  it("renders negative axes as secondary markers", () => {
    render(<CameraOrientationGizmo onDirection={() => undefined} />);

    const positiveX = screen.getByRole("button", {
      name: "View from positive X axis",
    });
    const negativeX = screen.getByRole("button", {
      name: "View from negative X axis",
    });
    const positiveMarker = positiveX.firstElementChild as HTMLElement;
    const negativeMarker = negativeX.firstElementChild as HTMLElement;

    expect(positiveX.style.width).toBe("18px");
    expect(negativeX.style.width).toBe("18px");
    expect(positiveMarker.style.width).toBe("18px");
    expect(positiveMarker.style.opacity).toBe("1");
    expect(negativeMarker.style.width).toBe("10px");
    expect(negativeMarker.style.opacity).toBe("0.55");
  });

  it("updates live orientation without reconciling the DOM overlay", () => {
    render(<CameraOrientationGizmo onDirection={() => undefined} />);
    const positiveX = screen.getByRole("button", {
      name: "View from positive X axis",
    });
    const initialHtmlRenderCount = harness.htmlRenderCount;
    expect(positiveX.style.left).toBe("70px");
    expect(positiveX.style.top).toBe("42px");

    harness.camera.quaternion.setFromAxisAngle(
      new THREE.Vector3(0, 0, 1),
      Math.PI / 2,
    );
    act(() => harness.frame?.({ camera: harness.camera }));

    expect(positiveX.style.left).toBe("42px");
    expect(positiveX.style.top).toBe("70px");
    expect(harness.htmlRenderCount).toBe(initialHtmlRenderCount);
  });
});
