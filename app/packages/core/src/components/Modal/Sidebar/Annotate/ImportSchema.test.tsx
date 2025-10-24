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

describe("ImportSchema", () => {
  afterEach(() => {
    cleanup();
  });

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

  it("shows unsupported media alert when disabled=true", () => {
    render(<ImportSchema disabled={true} />);

    const alert = screen.getByText(
      /annotation is not yet supported for this type of media or view/i
    );
    expect(alert).toBeTruthy();
  });

  it("does not show unsupported media alert when disabled=false", () => {
    render(<ImportSchema disabled={false} />);

    const alert = screen.queryByText(
      /annotation is not yet supported for this type of media or view/i
    );
    expect(alert).toBeNull();
  });

  it("renders the main title and description", () => {
    render(<ImportSchema disabled={false} />);

    expect(screen.getByText(/annotate faster than ever/i)).toBeTruthy();
    expect(
      screen.getByText(/add your annotation schemas to access and edit labels/i)
    ).toBeTruthy();
  });
});
