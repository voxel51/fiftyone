import { render, screen } from "@testing-library/react";
import React from "react";
import { ThemeProvider } from "styled-components";
import { beforeEach, describe, expect, it, vi } from "vitest";
import GridHeaderSampleRendererControls from "./GridHeaderSampleRendererControls";

const {
  dataset,
  getSampleRendererGridSlotComponent,
  schema,
  useActivePlugins,
  useCurrentDataset,
  useSampleSchema,
} = vi.hoisted(() => ({
  dataset: { mediaType: "multimodal", name: "dataset" },
  getSampleRendererGridSlotComponent: vi.fn(),
  schema: { filepath: { ftype: "StringField" } },
  useActivePlugins: vi.fn(),
  useCurrentDataset: vi.fn(),
  useSampleSchema: vi.fn(),
}));

vi.mock("@fiftyone/plugins", () => ({
  PluginComponentType: { SampleRenderer: 4 },
  SAMPLE_RENDERER_GRID_SLOT: {
    HEADER_AFTER_RESOURCE_COUNT: "grid-header-after-resource-count",
  },
  getSampleRendererGridSlotComponent: (...args: unknown[]) =>
    getSampleRendererGridSlotComponent(...args),
  useActivePlugins: (...args: unknown[]) => useActivePlugins(...args),
}));

vi.mock("@fiftyone/state", () => ({
  useCurrentDataset: (...args: unknown[]) => useCurrentDataset(...args),
  useSampleSchema: (...args: unknown[]) => useSampleSchema(...args),
}));

const theme = {
  primary: {
    plainBorder: "#333",
  },
};

const renderControls = () =>
  render(
    <ThemeProvider theme={theme}>
      <GridHeaderSampleRendererControls />
    </ThemeProvider>,
  );

describe("GridHeaderSampleRendererControls", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useCurrentDataset.mockReturnValue(dataset);
    useSampleSchema.mockReturnValue(schema);
    getSampleRendererGridSlotComponent.mockImplementation(
      (registration, slot) => {
        if (registration.sampleRendererOptions.grid?.enabled !== true) {
          return null;
        }

        return registration.sampleRendererOptions.grid?.slots?.[slot] || null;
      },
    );
  });

  it("renders header controls declared by active grid sample renderers", () => {
    const HeaderComponent = () => <div>stream selector</div>;
    const DisabledComponent = () => <div>disabled selector</div>;
    useActivePlugins.mockReturnValue([
      {
        name: "disabled",
        sampleRendererOptions: {
          grid: {
            enabled: false,
            slots: {
              "grid-header-after-resource-count": DisabledComponent,
            },
          },
        },
      },
      {
        name: "no-header",
        sampleRendererOptions: {
          grid: { enabled: true },
        },
      },
      {
        name: "mcap",
        sampleRendererOptions: {
          grid: {
            enabled: true,
            slots: {
              "grid-header-after-resource-count": HeaderComponent,
            },
          },
        },
      },
    ]);

    renderControls();

    expect(screen.getByText("stream selector")).toBeTruthy();
    expect(screen.queryByText("disabled selector")).toBeNull();
    expect(useActivePlugins).toHaveBeenCalledWith(4, {
      dataset,
      schema,
    });
    expect(getSampleRendererGridSlotComponent).toHaveBeenCalledWith(
      expect.objectContaining({ name: "mcap" }),
      "grid-header-after-resource-count",
    );
  });
});
