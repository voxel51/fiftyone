import { cleanup, render, screen } from "@testing-library/react";
import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import * as voodoMock from "../../../__tests__/voodo-mock";

vi.mock("@voxel51/voodo", () => voodoMock);

// eslint-disable-next-line import/first
import { TileHarness } from "../../../__tests__/tile-harness";
// eslint-disable-next-line import/first
import CameraTile from "./CameraTile";

describe("CameraTile", () => {
  afterEach(() => cleanup());

  it("renders the placeholder label when no source is bound", () => {
    render(
      <TileHarness tileId="camera-1">
        <CameraTile />
      </TileHarness>
    );
    expect(screen.getByText("Camera feed")).toBeTruthy();
    expect(screen.getByText("REC")).toBeTruthy();
  });
});
