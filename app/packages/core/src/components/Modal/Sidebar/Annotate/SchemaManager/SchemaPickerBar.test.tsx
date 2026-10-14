import {
  cleanup,
  configure,
  fireEvent,
  render,
  screen,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import SchemaPickerBar, { type SchemaPickerBarProps } from "./SchemaPickerBar";

configure({ testIdAttribute: "data-cy" });

const props = (
  overrides: Partial<SchemaPickerBarProps> = {},
): SchemaPickerBarProps => ({
  naming: null,
  nameValue: "",
  docName: undefined,
  docMode: false,
  docsAvailable: true,
  docs: [
    { id: "a", name: "oct_1" },
    { id: "b", name: "review" },
  ],
  selectedId: null,
  setNameValue: vi.fn(),
  setNaming: vi.fn(),
  submitName: vi.fn(),
  cancelNaming: vi.fn(),
  selectSchema: vi.fn(),
  duplicateSchema: vi.fn(),
  deleteSchema: vi.fn(),
  ...overrides,
});

describe("SchemaPickerBar schema picker", () => {
  afterEach(cleanup);

  it("is a pick list, not a text input", () => {
    render(<SchemaPickerBar {...props()} />);

    expect(screen.queryByRole("combobox")).toBeNull();
    expect(screen.queryByRole("textbox")).toBeNull();
    expect(screen.getByTestId("schema-select").textContent).toContain(
      "Default schema (all fields)",
    );
  });

  it("shows the selected schema", () => {
    render(<SchemaPickerBar {...props({ selectedId: "b", docMode: true })} />);

    expect(screen.getByTestId("schema-select").textContent).toContain("review");
  });

  it("selects a schema and the dataset default from the menu", () => {
    const selectSchema = vi.fn();
    render(<SchemaPickerBar {...props({ selectSchema })} />);

    fireEvent.click(screen.getByTestId("schema-select"));
    fireEvent.click(screen.getByText("oct_1"));
    expect(selectSchema).toHaveBeenLastCalledWith("a");

    fireEvent.click(screen.getByTestId("schema-select"));
    fireEvent.click(screen.getByTestId("schema-option-default"));
    expect(selectSchema).toHaveBeenLastCalledWith("");
  });
});
