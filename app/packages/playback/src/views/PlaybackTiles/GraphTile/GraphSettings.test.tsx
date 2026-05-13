import { cleanup, render, screen } from "@testing-library/react";
import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import * as voodoMock from "../../../__tests__/voodo-mock";

vi.mock("@voxel51/voodo", () => voodoMock);

// eslint-disable-next-line import/first
import { TileHarness } from "../../../__tests__/tile-harness";
// eslint-disable-next-line import/first
import GraphSettings from "./GraphSettings";

describe("GraphSettings", () => {
  afterEach(() => cleanup());

  it("lists graph sources and renders the series toggles", () => {
    render(
      <TileHarness
        tileId="graph-1"
        register={[
          { streamId: "imu", type: "graph", typeLabel: "Graph", title: "IMU" },
          {
            streamId: "vels",
            type: "graph",
            typeLabel: "Graph",
            title: "Velocity",
          },
        ]}
      >
        <GraphSettings />
      </TileHarness>
    );
    const select = screen.getByTestId("voodo-select") as HTMLSelectElement;
    expect(Array.from(select.options).map((o) => o.textContent)).toEqual([
      "IMU",
      "Velocity",
    ]);
    expect(screen.getByText("velocity")).toBeTruthy();
    expect(screen.getByText("accel")).toBeTruthy();
    expect(screen.getByText("Show playhead")).toBeTruthy();
  });
});
