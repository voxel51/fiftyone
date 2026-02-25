import React from "react";
import { render, screen, cleanup } from "@testing-library/react";
import { describe, expect, it, vi, afterEach } from "vitest";
import ImportSchema from "./ImportSchema";

// Mock the custom hooks
vi.mock("./useCanManageSchema", () => ({
  default: vi.fn(() => true),
}));

vi.mock("./useShowModal", () => ({
  default: vi.fn(() => vi.fn()),
}));

// Mock RequiredFieldPrompt to avoid pulling in its deep dependencies
vi.mock("./RequiredFieldPrompt", () => ({
  default: vi.fn(({ requiredField }) => (
    <div data-testid="required-field-prompt">{requiredField.field}</div>
  )),
}));

describe("ImportSchema", () => {
  afterEach(() => {
    cleanup();
  });

  describe("SetupPrompt (default)", () => {
    it("renders with button enabled when disabled=false and user can manage", () => {
      render(<ImportSchema disabled={false} />);

      const button = screen.getByRole("button", { name: /add schema/i });
      expect(button.disabled).toBe(false);
    });

    it("renders with button disabled when disabled=true", () => {
      render(<ImportSchema disabled={true} />);

      const button = screen.getByRole("button", { name: /add schema/i });
      expect(button.disabled).toBe(true);
    });

    it("renders the main title and description", () => {
      render(<ImportSchema disabled={false} />);

      expect(screen.getByText(/annotate faster than ever/i)).toBeTruthy();
      expect(
        screen.getByText(
          /import your dataset schema to access and edit labels/i
        )
      ).toBeTruthy();
    });
  });

  describe("alert messages", () => {
    it("shows unsupported media alert when disabled=true", () => {
      render(<ImportSchema disabled={true} />);

      const alert = screen.getByText(
        /annotation is not yet supported for this type of media or view/i
      );
      expect(alert).toBeTruthy();
    });

    it("shows custom disabled message when provided", () => {
      render(
        <ImportSchema disabled={true} disabledMsg="Custom disabled reason" />
      );

      expect(screen.getByText("Custom disabled reason")).toBeTruthy();
    });

    it("does not show alert when disabled=false", () => {
      render(<ImportSchema disabled={false} />);

      const alert = screen.queryByText(
        /annotation is not yet supported for this type of media or view/i
      );
      expect(alert).toBeNull();
    });
  });

  describe("requiredField prop", () => {
    it("shows RequiredFieldPrompt when requiredField is provided and not disabled", () => {
      render(
        <ImportSchema
          requiredField={{ field: "ground_truth", hasSchema: false }}
        />
      );

      expect(screen.getByTestId("required-field-prompt")).toBeTruthy();
      expect(screen.getByText("ground_truth")).toBeTruthy();
      expect(screen.queryByText(/annotate faster than ever/i)).toBeNull();
    });

    it("shows SetupPrompt (not RequiredFieldPrompt) when disabled even with requiredField", () => {
      render(
        <ImportSchema
          disabled={true}
          requiredField={{ field: "ground_truth", hasSchema: false }}
        />
      );

      expect(screen.queryByTestId("required-field-prompt")).toBeNull();
      expect(screen.getByRole("button", { name: /add schema/i })).toBeTruthy();
    });

    it("shows SetupPrompt when requiredField is null", () => {
      render(<ImportSchema requiredField={null} />);

      expect(screen.queryByTestId("required-field-prompt")).toBeNull();
      expect(screen.getByText(/annotate faster than ever/i)).toBeTruthy();
    });

    it("shows SetupPrompt when requiredField is not provided", () => {
      render(<ImportSchema />);

      expect(screen.queryByTestId("required-field-prompt")).toBeNull();
      expect(screen.getByText(/annotate faster than ever/i)).toBeTruthy();
    });
  });
});
