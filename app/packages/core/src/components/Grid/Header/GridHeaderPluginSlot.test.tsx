import { render, screen } from "@testing-library/react";
import React from "react";
import { ThemeProvider } from "styled-components";
import { beforeEach, describe, expect, it, vi } from "vitest";
import GridHeaderPluginSlot from "./GridHeaderPluginSlot";

const { componentHasSlot, dataset, useActivePlugins, useCurrentDataset } =
  vi.hoisted(() => ({
    componentHasSlot: vi.fn(),
    dataset: { mediaType: "multimodal", name: "dataset" },
    useActivePlugins: vi.fn(),
    useCurrentDataset: vi.fn(),
  }));

vi.mock("@fiftyone/plugins", () => ({
  PLUGIN_COMPONENT_SLOT: {
    GRID_HEADER_AFTER_RESOURCE_COUNT: "grid-header-after-resource-count",
  },
  PluginComponentType: { Component: 3 },
  componentHasSlot: (...args: unknown[]) => componentHasSlot(...args),
  useActivePlugins: (...args: unknown[]) => useActivePlugins(...args),
}));

vi.mock("@fiftyone/state", () => ({
  useCurrentDataset: (...args: unknown[]) => useCurrentDataset(...args),
}));

const theme = {
  primary: {
    plainBorder: "#333",
  },
};

const renderSlot = () =>
  render(
    <ThemeProvider theme={theme}>
      <GridHeaderPluginSlot />
    </ThemeProvider>
  );

describe("GridHeaderPluginSlot", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useCurrentDataset.mockReturnValue(dataset);
    componentHasSlot.mockImplementation(
      (component) =>
        component.componentOptions?.slots?.includes(
          "grid-header-after-resource-count"
        ) === true
    );
  });

  it("renders only components registered for the grid header slot", () => {
    const SlotComponent = () => <div>slot component</div>;
    const SlotlessComponent = () => <div>slotless component</div>;
    useActivePlugins.mockReturnValue([
      {
        component: SlotlessComponent,
        componentOptions: {},
        name: "slotless",
      },
      {
        component: SlotComponent,
        componentOptions: {
          slots: ["grid-header-after-resource-count"],
        },
        name: "slot",
      },
    ]);

    renderSlot();

    expect(screen.getByText("slot component")).toBeTruthy();
    expect(screen.queryByText("slotless component")).toBeNull();
    expect(useActivePlugins).toHaveBeenCalledWith(3, {
      dataset,
      slot: "grid-header-after-resource-count",
      surface: "grid",
    });
  });
});
