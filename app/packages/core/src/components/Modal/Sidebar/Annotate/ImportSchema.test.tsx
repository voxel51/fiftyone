import React from "react";
import { render, screen, cleanup } from "@testing-library/react";
import { describe, expect, it, vi, afterEach, beforeEach } from "vitest";
import ImportSchema from "./ImportSchema";

vi.mock("./useCanManageSchema", () => ({
  default: vi.fn(() => true),
}));

vi.mock("./SchemaManager/hooks", () => ({
  useSchemaManagerModal: vi.fn(() => ({
    schemaManagerDisplayed: false,
    openSchemaManager: vi.fn(),
    closeSchemaManager: vi.fn(),
  })),
}));

vi.mock("./RequiredFieldPrompt", () => ({
  default: vi.fn(({ requiredField }) => (
    <div data-testid="required-field-prompt">{requiredField?.field}</div>
  )),
}));

describe("ImportSchema", () => {
  afterEach(() => {
    cleanup();
  });

  describe("SetupPrompt", () => {
    it("renders enabled button with title and description", () => {
      render(<ImportSchema disabled={false} />);

      expect(screen.getByText(/annotate faster than ever/i)).toBeTruthy();
      expect(
        screen.getByText(
          /import your dataset schema to access and edit labels/i,
        ),
      ).toBeTruthy();
      expect(screen.getByRole("button", { name: /add schema/i }).disabled).toBe(
        false,
      );
    });

    it("renders disabled button with default alert when disabled=true", () => {
      render(<ImportSchema disabled={true} />);

      expect(screen.getByRole("button", { name: /add schema/i }).disabled).toBe(
        true,
      );
      expect(
        screen.getByText(
          /annotation is not yet supported for this type of media or view/i,
        ),
      ).toBeTruthy();
    });

    it("shows custom disabled message when provided", () => {
      render(
        <ImportSchema disabled={true} disabledMsg="Custom disabled reason" />,
      );

      expect(screen.getByText("Custom disabled reason")).toBeTruthy();
    });

    it.each([
      ["null", { requiredField: null }],
      ["undefined", {}],
      [
        "disabled=true with requiredField",
        {
          disabled: true,
          requiredField: { field: "ground_truth", hasSchema: false },
        },
      ],
    ])(
      "shows SetupPrompt instead of RequiredFieldPrompt when requiredField is %s",
      (_label, props) => {
        render(<ImportSchema {...props} />);

        expect(screen.queryByTestId("required-field-prompt")).toBeNull();
        expect(
          screen.getByRole("button", { name: /add schema/i }),
        ).toBeTruthy();
      },
    );

    it("calls openSchemaManager when Add schema button is clicked", async () => {
      const mockOpenSchemaManager = vi.fn();
      const mod = await import("./SchemaManager/hooks");
      vi.mocked(mod.useSchemaManagerModal).mockReturnValue({
        schemaManagerDisplayed: false,
        openSchemaManager: mockOpenSchemaManager,
        closeSchemaManager: vi.fn(),
      });

      render(<ImportSchema disabled={false} />);

      screen.getByRole("button", { name: /add schema/i }).click();

      expect(mockOpenSchemaManager).toHaveBeenCalledOnce();
    });
  });

  describe("RequiredFieldPrompt", () => {
    it("renders when requiredField is provided and not disabled", () => {
      render(
        <ImportSchema
          requiredField={{ field: "ground_truth", hasSchema: false }}
        />,
      );

      expect(screen.getByTestId("required-field-prompt")).toBeTruthy();
      expect(screen.getByText("ground_truth")).toBeTruthy();
      expect(screen.queryByText(/annotate faster than ever/i)).toBeNull();
    });
  });

  describe("canManage=false", () => {
    beforeEach(async () => {
      const mod = await import("./useCanManageSchema");
      vi.mocked(mod.default).mockReturnValue(false);
    });

    afterEach(async () => {
      const mod = await import("./useCanManageSchema");
      vi.mocked(mod.default).mockReturnValue(true);
    });

    it("shows permissions alert and renders RequiredFieldPrompt with requiredField", () => {
      render(
        <ImportSchema
          requiredField={{ field: "ground_truth", hasSchema: false }}
        />,
      );

      expect(screen.getByTestId("required-field-prompt")).toBeTruthy();
      expect(
        screen.getByText("Only dataset managers can add schemas."),
      ).toBeTruthy();
    });

    it("shows permissions alert and disables button without requiredField", () => {
      render(<ImportSchema disabled={false} />);

      expect(screen.getByRole("button", { name: /add schema/i }).disabled).toBe(
        true,
      );
      expect(
        screen.getByText("Only dataset managers can add schemas."),
      ).toBeTruthy();
    });
  });
});
