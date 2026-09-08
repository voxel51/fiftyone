// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

// An operator launched from the action row's overflow popout opens the
// operator palette, which the popout would otherwise cover

const promptForInput = vi.fn();
const execute = vi.fn();

vi.mock("@fiftyone/components", () => ({
  ErrorBoundary: ({ children }: { children: React.ReactNode }) => children,
  Link: "a",
  PillButton: ({ onClick, title }: { onClick: () => void; title: string }) => (
    <button onClick={onClick} type="button">
      {title}
    </button>
  ),
}));
vi.mock("@fiftyone/core/src/components/Actions/utils", () => ({
  getStringAndNumberProps: () => ({}),
}));
vi.mock("@fiftyone/plugins", () => ({
  PluginComponentType: { Component: "component" },
  useActivePlugins: () => [],
}));
vi.mock("@fiftyone/state", () => ({
  withSuspense: (component: unknown) => component,
}));
vi.mock("./OperatorIcon", () => ({ default: () => null }));
vi.mock("./state", () => ({
  useOperatorExecutor: () => ({ execute }),
  useOperatorPlacements: () => ({ placements: [] }),
  usePromptOperatorInput: () => promptForInput,
}));
vi.mock(".", () => ({
  types: { Places: { SAMPLES_GRID_ACTIONS: "samples-grid-actions" } },
}));

import { OperatorPlacementWithErrorBoundary } from "./OperatorPlacements";

const URI = "@voxel51/yolo/finetune";

const renderPlacement = (closeOverflow?: () => void) =>
  render(
    <OperatorPlacementWithErrorBoundary
      place={"samples-grid-actions" as never}
      operator={
        { uri: URI, name: "finetune", label: "Finetune YOLOv8" } as never
      }
      placement={{ view: { name: "Button" } } as never}
      adaptiveMenuItemProps={
        closeOverflow ? { variant: "overflow", closeOverflow } : undefined
      }
    />,
  );

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("operator placements", () => {
  it("closes the overflow popout when the operator is launched from it", () => {
    const closeOverflow = vi.fn();
    renderPlacement(closeOverflow);

    fireEvent.click(screen.getByRole("button", { name: "Finetune YOLOv8" }));

    expect(closeOverflow).toHaveBeenCalledTimes(1);
    expect(promptForInput).toHaveBeenCalledWith(URI);
  });

  it("launches the operator when the row has no overflow", () => {
    renderPlacement();

    fireEvent.click(screen.getByRole("button", { name: "Finetune YOLOv8" }));

    expect(promptForInput).toHaveBeenCalledWith(URI);
  });
});
