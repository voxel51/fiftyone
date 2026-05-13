import { cleanup, render } from "@testing-library/react";
import React from "react";
import { afterEach, describe, expect, it } from "vitest";

import { TileHarness } from "../../../__tests__/tile-harness";
import BlobTile from "./BlobTile";

describe("BlobTile", () => {
  afterEach(() => cleanup());

  it("renders the blob svg and the playhead readout label", () => {
    const { container } = render(
      <TileHarness tileId="blob-1">
        <BlobTile />
      </TileHarness>
    );
    expect(container.querySelector("svg")).toBeTruthy();
    expect(container.querySelector("path")).toBeTruthy();
    expect(container.textContent).toMatch(/blob · t=0\.00s/);
  });
});
