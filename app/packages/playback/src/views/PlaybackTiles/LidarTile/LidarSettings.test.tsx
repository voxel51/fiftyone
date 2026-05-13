import { cleanup, render, screen } from "@testing-library/react";
import React from "react";
import { afterEach, describe, expect, it } from "vitest";

import { TileHarness } from "../../../__tests__/tile-harness";
import LidarSettings from "./LidarSettings";

describe("LidarSettings", () => {
  afterEach(() => cleanup());

  it("lists lidar sources and renders the per-tile toggles", () => {
    render(
      <TileHarness
        tileId="lidar-1"
        register={[
          {
            streamId: "lidar_top",
            type: "lidar",
            typeLabel: "Lidar",
            title: "Lidar top",
          },
        ]}
      >
        <LidarSettings />
      </TileHarness>
    );
    const select = screen.getByTestId("voodo-select") as HTMLSelectElement;
    expect(select.options[0].textContent).toBe("Lidar top");
    expect(screen.getByText("Color by height")).toBeTruthy();
    expect(screen.getByText("Show ground plane")).toBeTruthy();
    expect(screen.getByText("Show intensity overlay")).toBeTruthy();
    expect(screen.getByText("Cull behind sensor")).toBeTruthy();
  });
});
