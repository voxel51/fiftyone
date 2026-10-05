import { render } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { SchemaSelection } from "./SchemaSelection";

const { dispatch, settings } = vi.hoisted(() => ({
  dispatch: vi.fn(),
  settings: { current: {} as Record<string, unknown> },
}));

vi.mock("@fiftyone/events", () => ({
  getEventBus: () => ({ dispatch }),
}));

vi.mock("@fiftyone/state", () => ({
  useSchemaSettings: () => settings.current,
  useSearchSchemaFields: () => ({ searchResults: [] }),
}));

vi.mock("./SchemaSelectControls", () => ({
  SchemaSelectionControls: () => null,
}));
vi.mock("./SchemaSelectionRow", () => ({ SchemaSelectionRow: () => null }));
vi.mock("./SchemaSearchHelp", () => ({ SchemaSearchHelp: () => null }));

const finalSchema = [
  { path: "id", isSelected: true },
  { path: "ground_truth", isSelected: false, description: "gt" },
  { path: "metadata.width", isSelected: true, skip: true },
  { path: "tags", isSelected: true },
];

const settingsWith = (overrides: Record<string, unknown>) => ({
  finalSchema,
  isFilterRuleActive: false,
  showMetadata: false,
  finalSchemaKeyByPath: {},
  setExpandedPaths: vi.fn(),
  expandedPaths: null,
  mergedSchema: {},
  ...overrides,
});

describe("SchemaSelection e2e:schema:selection-shown", () => {
  beforeEach(() => dispatch.mockClear());

  it("reports the shown rows and the checked ones, in order", () => {
    settings.current = settingsWith({});

    render(<SchemaSelection />);

    expect(dispatch.mock.calls).toEqual([
      [
        "e2e:schema:selection-shown",
        { shown: "id,ground_truth,tags", checked: "id,tags", metadata: false },
      ],
    ]);
  });

  it("reports again only when the rows change", () => {
    settings.current = settingsWith({});
    const { rerender } = render(<SchemaSelection />);

    settings.current = settingsWith({ finalSchema: [...finalSchema] });
    rerender(<SchemaSelection />);
    settings.current = settingsWith({ finalSchema: finalSchema.slice(1) });
    rerender(<SchemaSelection />);

    expect(dispatch.mock.calls.map(([, detail]) => detail.shown)).toEqual([
      "id,ground_truth,tags",
      "ground_truth,tags",
    ]);
  });

  it("waits for the metadata to expand before reporting it shown", () => {
    const setExpandedPaths = vi.fn();
    settings.current = settingsWith({ showMetadata: true, setExpandedPaths });

    render(<SchemaSelection />);

    expect(setExpandedPaths).toHaveBeenCalledTimes(1);
    expect(dispatch).not.toHaveBeenCalled();
  });
});
