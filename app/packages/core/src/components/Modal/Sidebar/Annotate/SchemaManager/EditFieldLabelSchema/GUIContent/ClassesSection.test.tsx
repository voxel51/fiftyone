/**
 * @vitest-environment jsdom
 */
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import React from "react";
import { ThemeProvider } from "styled-components";
import { afterEach, describe, expect, it, vi } from "vitest";
import ClassesSection from "./ClassesSection";

// ComponentTypeButton reads palette colors through @fiftyone/components'
// useTheme, which needs the app's Recoil graph; stub the palette instead.
vi.mock("@fiftyone/components", () => ({
  useTheme: () => ({
    voxel: { 500: "#ff6d04" },
    primary: { softBorder: "#333333" },
  }),
}));

const baseProps = {
  attributeCount: 0,
  onAddClass: vi.fn(),
  onEditClass: vi.fn(),
  onDeleteClass: vi.fn(),
};

const manyClasses = Array.from({ length: 30 }, (_, i) => `class-${i}`);

// The section's styled helpers (EmptyStateBox) read palette tokens from the
// styled-components theme.
const renderSection = (ui: React.ReactElement) =>
  render(
    <ThemeProvider theme={{ background: { level1: "#111111" } }}>
      {ui}
    </ThemeProvider>,
  );

describe("ClassesSection input type", () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it("offers radio and dropdown with the current component selected", () => {
    renderSection(
      <ClassesSection
        {...baseProps}
        classes={manyClasses}
        component="radio"
        onComponentChange={vi.fn()}
      />,
    );

    expect(
      screen.getByRole("button", { name: /radio/i, pressed: true }),
    ).toBeTruthy();
    expect(
      screen.getByRole("button", { name: /dropdown/i, pressed: false }),
    ).toBeTruthy();
  });

  it("reports the newly chosen component", () => {
    const onComponentChange = vi.fn();
    renderSection(
      <ClassesSection
        {...baseProps}
        classes={manyClasses}
        component="radio"
        onComponentChange={onComponentChange}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /dropdown/i }));

    expect(onComponentChange).toHaveBeenCalledWith("dropdown");
  });

  it("activates from the keyboard with Enter and Space", () => {
    const onComponentChange = vi.fn();
    renderSection(
      <ClassesSection
        {...baseProps}
        classes={manyClasses}
        component="radio"
        onComponentChange={onComponentChange}
      />,
    );

    const dropdown = screen.getByRole("button", { name: /dropdown/i });
    expect(dropdown.getAttribute("tabindex")).toBe("0");

    fireEvent.keyDown(dropdown, { key: "Enter" });
    fireEvent.keyDown(dropdown, { key: " " });

    expect(onComponentChange).toHaveBeenCalledTimes(2);
    expect(onComponentChange).toHaveBeenLastCalledWith("dropdown");
  });

  it("hides the control when there are no classes", () => {
    renderSection(
      <ClassesSection
        {...baseProps}
        classes={[]}
        onComponentChange={vi.fn()}
      />,
    );

    expect(screen.queryByText("Input type")).toBeNull();
  });
});
