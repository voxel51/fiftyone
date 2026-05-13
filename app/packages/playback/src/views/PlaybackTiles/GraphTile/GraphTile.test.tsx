import { cleanup, render } from "@testing-library/react";
import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import * as voodoMock from "../../../__tests__/voodo-mock";

vi.mock("@voxel51/voodo", () => voodoMock);

// eslint-disable-next-line import/first
import { TileHarness } from "../../../__tests__/tile-harness";
// eslint-disable-next-line import/first
import GraphTile from "./GraphTile";

describe("GraphTile", () => {
  afterEach(() => cleanup());

  it("renders the chart svg with the two series paths and the playhead line", () => {
    const { container } = render(
      <TileHarness tileId="graph-1" duration={10}>
        <GraphTile />
      </TileHarness>
    );
    const svg = container.querySelector("svg");
    expect(svg).toBeTruthy();
    // Two series paths.
    expect(container.querySelectorAll("path").length).toBe(2);
    // Legend labels.
    expect(container.textContent).toContain("velocity");
    expect(container.textContent).toContain("accel");
  });
});
