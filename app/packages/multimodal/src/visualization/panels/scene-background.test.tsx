import { cleanup, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as THREE from "three";

import { SceneBackground } from "./base-3d-scene";

const harness = vi.hoisted(() => ({
  invalidate: vi.fn(),
  scene: {
    background: null as unknown,
    backgroundNode: null as unknown,
  },
}));

vi.mock("@react-three/fiber", () => ({
  useThree: (
    selector: (state: { invalidate: () => void; scene: unknown }) => unknown,
  ) => selector({ invalidate: harness.invalidate, scene: harness.scene }),
}));

vi.mock("@react-three/drei", () => ({
  GizmoHelper: () => null,
  GizmoViewport: () => null,
  OrbitControls: () => null,
}));

beforeEach(() => {
  harness.scene.background = null;
  harness.scene.backgroundNode = null;
  harness.invalidate.mockClear();
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("SceneBackground", () => {
  it("writes a plain color for solid fills", () => {
    render(
      <SceneBackground background={{ color: "#123456", kind: "solid" }} />,
    );

    const background = harness.scene.background as THREE.Color;
    expect(background).toBeInstanceOf(THREE.Color);
    expect(background.getHexString()).toBe("123456");
    expect(harness.scene.backgroundNode).toBeNull();
    expect(harness.invalidate).toHaveBeenCalled();
  });

  it("writes a background node for gradient fills", () => {
    render(
      <SceneBackground
        background={{ bottom: "#000000", kind: "gradient", top: "#ffffff" }}
      />,
    );

    expect(harness.scene.background).toBeNull();
    expect(harness.scene.backgroundNode).not.toBeNull();
  });

  it("switches fills in place and clears the scene on unmount", () => {
    const { rerender, unmount } = render(
      <SceneBackground background={{ color: "#050b12", kind: "solid" }} />,
    );
    expect(harness.scene.background).toBeInstanceOf(THREE.Color);

    rerender(
      <SceneBackground
        background={{ bottom: "#03060b", kind: "gradient", top: "#14243a" }}
      />,
    );
    expect(harness.scene.background).toBeNull();
    expect(harness.scene.backgroundNode).not.toBeNull();

    unmount();
    expect(harness.scene.background).toBeNull();
    expect(harness.scene.backgroundNode).toBeNull();
  });
});
