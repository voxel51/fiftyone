import { cleanup, render, screen } from "@testing-library/react";
import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import * as voodoMock from "../../../__tests__/voodo-mock";

vi.mock("@voxel51/voodo", () => voodoMock);

// eslint-disable-next-line import/first
import { TileHarness } from "../../../__tests__/tile-harness";
// eslint-disable-next-line import/first
import JsonDataSettings from "./JsonDataSettings";

describe("JsonDataSettings", () => {
  afterEach(() => cleanup());

  it("lists json sources and renders the formatting toggles", () => {
    render(
      <TileHarness
        tileId="json-1"
        register={[
          {
            streamId: "metadata",
            type: "json",
            typeLabel: "JSON Data",
            title: "Metadata",
          },
        ]}
      >
        <JsonDataSettings />
      </TileHarness>
    );
    const select = screen.getByTestId("voodo-select") as HTMLSelectElement;
    expect(select.options[0].textContent).toBe("Metadata");
    expect(screen.getByText("Pretty-print")).toBeTruthy();
    expect(screen.getByText("Show types")).toBeTruthy();
  });
});
