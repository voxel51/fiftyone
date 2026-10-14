import { cleanup, render } from "@testing-library/react";
import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

const dispatch = vi.fn();

vi.mock("@fiftyone/events", () => ({
  getEventBus: () => ({ dispatch }),
}));

vi.mock("./styled", () => {
  const Div = ({ children }: { children?: React.ReactNode }) => (
    <div>{children}</div>
  );
  return {
    CollapsibleHeader: Div,
    GUISectionHeader: Div,
    SelectableList: Div,
  };
});

vi.mock("./SelectAllCheckbox", () => ({ default: () => null }));

import FieldSections, { type FieldSectionsProps } from "./FieldSections";

const item = (id: string) => ({
  id,
  data: { canSelect: true, primaryContent: id },
});

const props = (
  overrides: Partial<FieldSectionsProps> = {},
): FieldSectionsProps => ({
  docMode: true,
  styles: { emptyText: {} } as FieldSectionsProps["styles"],
  scannedItems: [item("detections")],
  restItems: [item("tags")],
  hiddenItems: [item("events")],
  activeCount: 2,
  hiddenCount: 1,
  canReorder: false,
  handleOrderChange: vi.fn(),
  selectedActive: new Set(),
  selectedHidden: new Set(),
  selectedActiveList: [],
  selectedHiddenList: [],
  setActiveSelection: vi.fn(),
  setHiddenSelection: vi.fn(),
  onActiveSelected: vi.fn(),
  onHiddenSelected: vi.fn(),
  activeRange: { onMouseDownCapture: vi.fn() },
  hiddenRange: { onMouseDownCapture: vi.fn() },
  hiddenExpanded: true,
  setHiddenExpanded: vi.fn(),
  ...overrides,
});

const shown = (section: string, paths: string) => [
  "e2e:schema-manager:fields",
  { section, paths },
];

describe("FieldSections e2e signal", () => {
  afterEach(() => {
    dispatch.mockClear();
    cleanup();
  });

  it("announces the rows each section renders", () => {
    render(<FieldSections {...props()} />);

    expect(dispatch.mock.calls).toEqual([
      shown("active", "detections,tags"),
      shown("hidden", "events"),
    ]);
  });

  it("announces a field once it moves to hidden", () => {
    const { rerender } = render(<FieldSections {...props()} />);
    dispatch.mockClear();
    rerender(
      <FieldSections
        {...props({
          restItems: [],
          hiddenItems: [item("events"), item("tags")],
        })}
      />,
    );

    expect(dispatch.mock.calls).toEqual([
      shown("active", "detections"),
      shown("hidden", "events,tags"),
    ]);
  });

  it("announces no hidden rows while the section is collapsed", () => {
    render(<FieldSections {...props({ hiddenExpanded: false })} />);

    expect(dispatch).toHaveBeenCalledWith(...shown("hidden", ""));
  });
});
