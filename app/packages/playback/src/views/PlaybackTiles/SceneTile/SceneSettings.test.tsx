import { cleanup, render, screen } from "@testing-library/react";
import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import * as voodoMock from "../../../__tests__/voodo-mock";

vi.mock("@voxel51/voodo", () => voodoMock);

// eslint-disable-next-line import/first
import { TileHarness } from "../../../__tests__/tile-harness";
// eslint-disable-next-line import/first
import SceneSettings from "./SceneSettings";

describe("SceneSettings", () => {
  afterEach(() => cleanup());

  it("lists scene sources and renders the per-tile toggles", () => {
    render(
      <TileHarness
        tileId="scene-1"
        register={[
          {
            streamId: "scene_world",
            type: "scene",
            typeLabel: "3D Scene",
            title: "Scene",
          },
        ]}
      >
        <SceneSettings />
      </TileHarness>
    );
    const select = screen.getByTestId("voodo-select") as HTMLSelectElement;
    expect(select.options[0].textContent).toBe("Scene");
    expect(screen.getByText("Show grid")).toBeTruthy();
    expect(screen.getByText("Show path")).toBeTruthy();
    expect(screen.getByText("Show axes")).toBeTruthy();
  });
});
