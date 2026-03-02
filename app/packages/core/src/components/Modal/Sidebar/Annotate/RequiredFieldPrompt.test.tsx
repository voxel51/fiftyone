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
import { InitializationStatus } from "./useAnnotationContextManager";
import type { RequiredField } from "./useSourceFieldToActivate";

const mockActivateField = vi.fn(() =>
  Promise.resolve({ status: InitializationStatus.Success })
);
const mockNotify = vi.fn();

vi.mock("./useCanManageSchema", () => ({
  default: vi.fn(() => true),
}));

vi.mock("./useAnnotationContextManager", async (importOriginal) => {
  const actual = await importOriginal<
    typeof import("./useAnnotationContextManager")
  >();
  return {
    ...actual,
    useAnnotationContextManager: vi.fn(() => ({
      activateField: mockActivateField,
    })),
  };
});

vi.mock("@fiftyone/state", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@fiftyone/state")>();
  return {
    ...actual,
    useNotification: vi.fn(() => mockNotify),
  };
});

describe("RequiredFieldPrompt", () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  const fieldWithoutSchema: RequiredField = {
    field: "ground_truth",
    hasSchema: false,
  };

  it("renders the field name in the prompt text", () => {
    render(<RequiredFieldPrompt requiredField={fieldWithoutSchema} />);

    expect(screen.getByText("ground_truth")).toBeTruthy();
    expect(screen.getByText(/field not in label schema/i)).toBeTruthy();
  });

  it("renders the add button with the field name", () => {
    render(<RequiredFieldPrompt requiredField={fieldWithoutSchema} />);

    const button = screen.getByRole("button", {
      name: /add "ground_truth" to schema/i,
    });
    expect(button).toBeTruthy();
    expect(button.disabled).toBe(false);
  });

  it("calls activateField on the context manager when clicked", async () => {
    render(<RequiredFieldPrompt requiredField={fieldWithoutSchema} />);

    fireEvent.click(
      screen.getByRole("button", { name: /add "ground_truth" to schema/i })
    );

    await waitFor(() => {
      expect(mockActivateField).toHaveBeenCalledWith("ground_truth");
    });
  });

  it("shows error notification on failure", async () => {
    mockActivateField.mockResolvedValueOnce({
      status: InitializationStatus.ServerError,
      message: "something went wrong",
    });

    render(<RequiredFieldPrompt requiredField={fieldWithoutSchema} />);
    fireEvent.click(
      screen.getByRole("button", { name: /add "ground_truth" to schema/i })
    );

    await waitFor(() => {
      expect(mockNotify).toHaveBeenCalledWith({
        msg: 'Failed to add "ground_truth" to schema',
        variant: "error",
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
