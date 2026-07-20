import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import EpisodeSidebarGroup from "./EpisodeSidebarGroup";

afterEach(() => cleanup());

describe("EpisodeSidebarGroup", () => {
  it("renders its children expanded by default", () => {
    render(
      <EpisodeSidebarGroup title="Cameras">
        <span>body content</span>
      </EpisodeSidebarGroup>,
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
      <EpisodeSidebarGroup title="Cameras">
        <span>body content</span>
      </EpisodeSidebarGroup>,
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
      <EpisodeSidebarGroup defaultExpanded={false} title="Appearance">
        <span>body content</span>
      </EpisodeSidebarGroup>,
    );

    expect(screen.queryByText("body content")).toBeNull();
  });

  it("shows the summary only while collapsed", () => {
    render(
      <EpisodeSidebarGroup
        defaultExpanded={false}
        summary="1 of 2 on"
        title="Cameras"
      >
        <span>body content</span>
      </EpisodeSidebarGroup>,
    );

    expect(screen.getByText("1 of 2 on")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: /Cameras/ }));
    expect(screen.queryByText("1 of 2 on")).toBeNull();
  });

  it("keeps the master toggle out of the expand/collapse button", () => {
    const onChange = vi.fn();
    render(
      <EpisodeSidebarGroup
        title="Cameras"
        toggle={{ ariaLabel: "Toggle cameras", checked: true, onChange }}
      >
        <span>body content</span>
      </EpisodeSidebarGroup>,
    );

    fireEvent.click(screen.getByRole("switch", { name: "Toggle cameras" }));

    expect(onChange).toHaveBeenCalledWith(false);
    // Flipping the switch must not fold the group.
    expect(screen.getByText("body content")).toBeTruthy();
  });

  it("exposes section help without nesting it in the header button", () => {
    render(
      <EpisodeSidebarGroup
        title="Pointcloud projections"
        tooltip="Explains pointcloud projections."
      >
        <span>body content</span>
      </EpisodeSidebarGroup>,
    );

    const help = screen.getByRole("img", {
      name: "Explains pointcloud projections.",
    });
    expect(help.getAttribute("data-tooltip")).toBe(
      "Explains pointcloud projections.",
    );
    expect(
      screen
        .getByRole("button", { name: /Pointcloud projections/ })
        .contains(help),
    ).toBe(false);
  });
});
