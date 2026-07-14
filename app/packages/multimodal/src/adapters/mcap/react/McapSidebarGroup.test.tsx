import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import McapSidebarGroup from "./McapSidebarGroup";

afterEach(() => cleanup());

describe("McapSidebarGroup", () => {
  it("renders its children expanded by default", () => {
    render(
      <McapSidebarGroup title="Cameras">
        <span>body content</span>
      </McapSidebarGroup>,
    );

    expect(screen.getByText("body content")).toBeTruthy();
    expect(
      screen
        .getByRole("button", { name: /Cameras/ })
        .getAttribute("aria-expanded"),
    ).toBe("true");
  });

  it("collapses and re-expands via the header button", () => {
    render(
      <McapSidebarGroup title="Cameras">
        <span>body content</span>
      </McapSidebarGroup>,
    );

    const header = screen.getByRole("button", { name: /Cameras/ });
    fireEvent.click(header);
    expect(screen.queryByText("body content")).toBeNull();
    expect(header.getAttribute("aria-expanded")).toBe("false");

    fireEvent.click(header);
    expect(screen.getByText("body content")).toBeTruthy();
  });

  it("honors defaultExpanded=false", () => {
    render(
      <McapSidebarGroup defaultExpanded={false} title="Appearance">
        <span>body content</span>
      </McapSidebarGroup>,
    );

    expect(screen.queryByText("body content")).toBeNull();
  });

  it("shows the summary only while collapsed", () => {
    render(
      <McapSidebarGroup
        defaultExpanded={false}
        summary="1 of 2 on"
        title="Cameras"
      >
        <span>body content</span>
      </McapSidebarGroup>,
    );

    expect(screen.getByText("1 of 2 on")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: /Cameras/ }));
    expect(screen.queryByText("1 of 2 on")).toBeNull();
  });

  it("keeps the master toggle out of the expand/collapse button", () => {
    const onChange = vi.fn();
    render(
      <McapSidebarGroup
        title="Cameras"
        toggle={{ ariaLabel: "Toggle cameras", checked: true, onChange }}
      >
        <span>body content</span>
      </McapSidebarGroup>,
    );

    fireEvent.click(screen.getByRole("switch", { name: "Toggle cameras" }));

    expect(onChange).toHaveBeenCalledWith(false);
    // Flipping the switch must not fold the group.
    expect(screen.getByText("body content")).toBeTruthy();
  });
});
