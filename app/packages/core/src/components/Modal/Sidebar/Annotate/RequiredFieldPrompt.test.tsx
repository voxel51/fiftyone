import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import React from "react";
import RequiredFieldPrompt from "./RequiredFieldPrompt";
import type { RequiredField } from "./useMissingSourceField";

const mockInitializeSchema = vi.fn(() => Promise.resolve());
const mockActivateSchemas = vi.fn(() => Promise.resolve());
const mockListSchemas = vi.fn(() =>
  Promise.resolve({ label_schemas: {}, active_label_schemas: [] })
);
const mockSetLabelSchema = vi.fn();
const mockSetActiveSchemaPaths = vi.fn();

vi.mock("./useCanManageSchema", () => ({
  default: vi.fn(() => true),
}));

vi.mock("./useSchemaManager", () => ({
  useSchemaManager: vi.fn(() => ({
    initializeSchema: mockInitializeSchema,
    activateSchemas: mockActivateSchemas,
    listSchemas: mockListSchemas,
  })),
}));

vi.mock("@fiftyone/state", () => ({
  useQueryPerformanceSampleLimit: vi.fn(() => 1000),
}));

vi.mock("./state", () => ({
  useAnnotationSchemaContext: vi.fn(() => ({
    setLabelSchema: mockSetLabelSchema,
    setActiveSchemaPaths: mockSetActiveSchemaPaths,
  })),
}));

describe("RequiredFieldPrompt", () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  const fieldWithoutSchema: RequiredField = {
    field: "ground_truth",
    hasSchema: false,
  };

  const fieldWithSchema: RequiredField = {
    field: "predictions",
    hasSchema: true,
  };

  it("renders the field name in the prompt text", () => {
    render(<RequiredFieldPrompt requiredField={fieldWithoutSchema} />);

    expect(screen.getByText("ground_truth")).toBeTruthy();
    expect(screen.getByText(/field not in schema/i)).toBeTruthy();
  });

  it("renders the add button with the field name", () => {
    render(<RequiredFieldPrompt requiredField={fieldWithoutSchema} />);

    const button = screen.getByRole("button", {
      name: /add "ground_truth" to schema/i,
    });
    expect(button).toBeTruthy();
    expect(button.disabled).toBe(false);
  });

  it("calls initializeSchema then activateSchemas when field has no schema", async () => {
    render(<RequiredFieldPrompt requiredField={fieldWithoutSchema} />);

    const button = screen.getByRole("button", {
      name: /add "ground_truth" to schema/i,
    });
    fireEvent.click(button);

    await waitFor(() => {
      expect(mockInitializeSchema).toHaveBeenCalledWith({
        field: "ground_truth",
        scan_samples: true,
        limit: 1000,
      });
      expect(mockActivateSchemas).toHaveBeenCalledWith({
        fields: ["ground_truth"],
      });
      expect(mockListSchemas).toHaveBeenCalled();
      expect(mockSetLabelSchema).toHaveBeenCalled();
      expect(mockSetActiveSchemaPaths).toHaveBeenCalled();
    });
  });

  it("skips initializeSchema when field already has a schema", async () => {
    render(<RequiredFieldPrompt requiredField={fieldWithSchema} />);

    const button = screen.getByRole("button", {
      name: /add "predictions" to schema/i,
    });
    fireEvent.click(button);

    await waitFor(() => {
      expect(mockInitializeSchema).not.toHaveBeenCalled();
      expect(mockActivateSchemas).toHaveBeenCalledWith({
        fields: ["predictions"],
      });
    });
  });

  it("disables button when canManage is false", async () => {
    const useCanManageSchema = await import("./useCanManageSchema");
    vi.mocked(useCanManageSchema.default).mockReturnValue(false);

    render(<RequiredFieldPrompt requiredField={fieldWithoutSchema} />);

    const button = screen.getByRole("button");
    expect(button.disabled).toBe(true);

    vi.mocked(useCanManageSchema.default).mockReturnValue(true);
  });
});
