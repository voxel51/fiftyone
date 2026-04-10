import {
  createSampleRendererRenderContext,
  type SampleRendererRenderContext,
} from "@fiftyone/plugins";
import { cleanup, render, screen } from "@testing-library/react";
import React from "react";
import { afterEach, describe, expect, it } from "vitest";
import { McapGridRenderer } from "./McapGridRenderer";
import { McapModalRenderer } from "./McapModalRenderer";

const dataset = { name: "multimodal-dataset" } as const;
const schema = { filepath: { ftype: "StringField" } } as const;

function createCtx(surface: "grid" | "modal") {
  return createSampleRendererRenderContext(
    {
      sample: {
        filepath: "/tmp/sensors/drive.mcap",
        media_type: "unknown",
      },
      urls: [{ field: "filepath", url: "/tmp/sensors/drive.mcap" }],
    },
    "filepath",
    dataset as any,
    schema as any,
    surface
  ) as SampleRendererRenderContext;
}

describe("Mcap renderers", () => {
  afterEach(() => {
    cleanup();
  });

  it("renders the grid inventory card", () => {
    render(<McapGridRenderer ctx={createCtx("grid")} />);

    expect(screen.getByTestId("mcap-grid-renderer")).toBeTruthy();
    expect(screen.getByText("MCAP")).toBeTruthy();
    expect(screen.getByText("drive.mcap")).toBeTruthy();
    expect(screen.getByText("filepath")).toBeTruthy();
    expect(screen.getByText("Modal view")).toBeTruthy();
  });

  it("renders the modal shell with left, center, and right regions", () => {
    render(<McapModalRenderer ctx={createCtx("modal")} />);

    expect(screen.getByTestId("mcap-shell-left")).toBeTruthy();
    expect(screen.getByTestId("mcap-shell-center")).toBeTruthy();
    expect(screen.getByTestId("mcap-shell-right")).toBeTruthy();
    expect(screen.getByTestId("mcap-shell-2d-panel")).toBeTruthy();
    expect(screen.getByTestId("mcap-shell-3d-panel")).toBeTruthy();
    expect(screen.getAllByText("multimodal-dataset").length).toBeGreaterThan(0);
    expect(screen.getAllByText("drive.mcap").length).toBeGreaterThan(0);
  });
});
