import { cleanup, render, screen } from "@testing-library/react";
import React from "react";
import { afterEach, describe, expect, it } from "vitest";

import { TileHarness } from "../../../__tests__/tile-harness";
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
