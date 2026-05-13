import { cleanup, render } from "@testing-library/react";
import React from "react";
import { afterEach, describe, expect, it } from "vitest";

import { TileHarness } from "../../../__tests__/tile-harness";
import JsonDataTile from "./JsonDataTile";

describe("JsonDataTile", () => {
  afterEach(() => cleanup());

  it("renders the placeholder JSON when no data prop and no source are provided", () => {
    const { container } = render(
      <TileHarness tileId="json-1">
        <JsonDataTile />
      </TileHarness>
    );
    expect(container.textContent).toContain('"pose"');
    expect(container.textContent).toContain('"status"');
  });

  it("renders the data prop when explicitly passed (overrides the stream)", () => {
    const { container } = render(
      <TileHarness tileId="json-1">
        <JsonDataTile data={{ hello: "world", n: 42 }} />
      </TileHarness>
    );
    expect(container.textContent).toContain('"hello"');
    expect(container.textContent).toContain('"world"');
    expect(container.textContent).toContain("42");
  });
});
