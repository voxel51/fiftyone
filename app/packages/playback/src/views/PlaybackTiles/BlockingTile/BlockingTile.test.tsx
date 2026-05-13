import { cleanup, render, screen } from "@testing-library/react";
import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import * as voodoMock from "../../../__tests__/voodo-mock";

vi.mock("@voxel51/voodo", () => voodoMock);

// eslint-disable-next-line import/first
import { TileHarness } from "../../../__tests__/tile-harness";
// eslint-disable-next-line import/first
import BlockingTile from "./BlockingTile";

describe("BlockingTile", () => {
  afterEach(() => cleanup());

  it("renders the ready state and the stream id on first mount", () => {
    render(
      <TileHarness tileId="blocking-1">
        <BlockingTile />
      </TileHarness>
    );
    expect(screen.getByText("Data exists")).toBeTruthy();
    expect(screen.getByText("blocking-1")).toBeTruthy();
  });
});
