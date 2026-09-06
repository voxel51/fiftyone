import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { registerSidebarTrayExtension } from "../../../extensions/sidebar-tray";
import { resetSidebarTrayExtensionsForTests } from "../../../extensions/sidebar-tray/registry";
import RightSidebarWithTrays from "./RightSidebarWithTrays";

// The sidebar surface itself has its own coverage; this suite is only about
// which trays get mounted and when.
vi.mock("./RightSidebar", () => ({
  default: ({ tray }: { tray?: React.ReactNode }) => (
    <div data-testid="stub-sidebar">{tray}</div>
  ),
}));

const registerStubTray = (id = "test:stub") =>
  registerSidebarTrayExtension({
    id,
    order: 1,
    Component: () => <div data-testid={`tray-${id}`} />,
  });

describe("RightSidebarWithTrays", () => {
  afterEach(() => {
    cleanup();
    resetSidebarTrayExtensionsForTests();
  });

  it("renders no tray when nothing is registered (the OSS case)", () => {
    render(<RightSidebarWithTrays />);

    expect(screen.getByTestId("stub-sidebar").children).toHaveLength(0);
  });

  it("renders a registered tray", () => {
    registerStubTray();

    render(<RightSidebarWithTrays />);

    expect(screen.getByTestId("tray-test:stub")).toBeTruthy();
  });

  it("does not mount a tray while the sidebar is closed", () => {
    registerStubTray();

    render(<RightSidebarWithTrays sidebarOpen={false} />);

    expect(screen.queryByTestId("tray-test:stub")).toBeNull();
  });

  it("keeps a tray mounted after the sidebar is reopened and closed", () => {
    registerStubTray();

    const { rerender } = render(<RightSidebarWithTrays sidebarOpen={false} />);
    rerender(<RightSidebarWithTrays sidebarOpen />);
    // Collapsing must not discard a tray's in-progress state.
    rerender(<RightSidebarWithTrays sidebarOpen={false} />);

    expect(screen.getByTestId("tray-test:stub")).toBeTruthy();
  });

  it("renders trays in registered order", () => {
    registerStubTray("test:second");
    registerSidebarTrayExtension({
      id: "test:first",
      order: 0,
      Component: () => <div data-testid="tray-test:first" />,
    });

    render(<RightSidebarWithTrays />);

    expect(
      [...screen.getByTestId("stub-sidebar").children].map((child) =>
        child.getAttribute("data-testid"),
      ),
    ).toEqual(["tray-test:first", "tray-test:second"]);
  });
});
