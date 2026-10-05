// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { Mock } from "vitest";
import { afterEach, describe, expect, it, vi } from "vitest";

// An operator launched from the action row's overflow popout opens the
// operator palette, which the popout would otherwise cover

// vi.mock factories are evaluated before module-scope consts, so the spies
// they close over live in vi.hoisted()
const { execute, promptForInput } = vi.hoisted(() => ({
  execute: vi.fn(),
  promptForInput: vi.fn(),
}));

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

const renderPlacement = ({
  closeOverflow,
  prompt = true,
}: { closeOverflow?: () => void; prompt?: boolean } = {}) =>
  render(
    <OperatorPlacementWithErrorBoundary
      place={"samples-grid-actions" as never}
      operator={
        { uri: URI, name: "finetune", label: "Finetune YOLOv8" } as never
      }
      placement={{ view: { name: "Button", options: { prompt } } } as never}
      adaptiveMenuItemProps={
        closeOverflow ? { variant: "overflow", closeOverflow } : undefined
      }
    />,
  );

const launch = () =>
  fireEvent.click(screen.getByRole("button", { name: "Finetune YOLOv8" }));

const calledBefore = (first: Mock, second: Mock) =>
  first.mock.invocationCallOrder[0] < second.mock.invocationCallOrder[0];

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("operator placements", () => {
  it("closes the overflow popout when the operator is launched from it", () => {
    const closeOverflow = vi.fn();
    renderPlacement({ closeOverflow });

    launch();

    expect(closeOverflow).toHaveBeenCalledTimes(1);
    expect(promptForInput).toHaveBeenCalledWith(URI);
    expect(calledBefore(closeOverflow, promptForInput)).toBe(true);
  });

  it("launches the operator when the row has no overflow", () => {
    renderPlacement();

    launch();

    expect(promptForInput).toHaveBeenCalledWith(URI);
  });

  it("executes without prompting when the placement opts out", () => {
    renderPlacement({ prompt: false });

    launch();

    expect(execute).toHaveBeenCalledWith({});
    expect(promptForInput).not.toHaveBeenCalled();
  });

  it("closes the overflow popout when an unprompted operator is launched from it", () => {
    const closeOverflow = vi.fn();
    renderPlacement({ closeOverflow, prompt: false });

    launch();

    expect(closeOverflow).toHaveBeenCalledTimes(1);
    expect(execute).toHaveBeenCalledWith({});
    expect(calledBefore(closeOverflow, execute)).toBe(true);
  });
});
