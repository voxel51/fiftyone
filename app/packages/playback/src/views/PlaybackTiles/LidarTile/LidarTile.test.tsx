import { cleanup, render, screen } from "@testing-library/react";
import React from "react";
import { afterEach, describe, expect, it } from "vitest";

import { TileHarness } from "../../../__tests__/tile-harness";
import LidarTile from "./LidarTile";

describe("LidarTile", () => {
  afterEach(() => cleanup());

  it("renders the placeholder scatter and the default 10 Hz label", () => {
    const { container } = render(
      <TileHarness tileId="lidar-1">
        <LidarTile />
      </TileHarness>
    );
    expect(screen.getByText("Lidar · 64ch")).toBeTruthy();
    expect(screen.getByText("10 Hz")).toBeTruthy();
    // Placeholder generates 160 dots.
    expect(container.querySelectorAll("circle").length).toBe(160);
  });
});
