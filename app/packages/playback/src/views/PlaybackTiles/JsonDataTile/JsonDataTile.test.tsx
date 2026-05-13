import { cleanup, render } from "@testing-library/react";
import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import * as voodoMock from "../../../__tests__/voodo-mock";

vi.mock("@voxel51/voodo", () => voodoMock);

// eslint-disable-next-line import/first
import { TileHarness } from "../../../__tests__/tile-harness";
// eslint-disable-next-line import/first
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
