import { cleanup, render } from "@testing-library/react";
import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

// @react-three/fiber renders a real WebGL canvas which jsdom can't host.
// Replace Canvas with a plain wrapper so the surrounding tile chrome still
// renders without spinning up three.js.
vi.mock("@react-three/fiber", () => ({
  Canvas: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="three-canvas">{children}</div>
  ),
}));

vi.mock("@react-three/drei", () => ({
  OrbitControls: () => null,
}));

import { TileHarness } from "../../../__tests__/tile-harness";
import SceneTile from "./SceneTile";

describe("SceneTile", () => {
  afterEach(() => cleanup());

  it("renders the canvas wrapper", () => {
    const { getByTestId } = render(
      <TileHarness tileId="scene-1">
        <SceneTile />
      </TileHarness>
    );
    expect(getByTestId("three-canvas")).toBeTruthy();
  });
});
