import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import styles from "../settings/controls/EpisodeSidebarTabs.module.css";
import RightSidebar from "./RightSidebar";

// Isolates this test to RightSidebar's own wiring (the tab list padding
// below, and which tab's content mounts by default) — neither sidebar's own
// content/data plumbing is relevant here and each has its own test coverage.
vi.mock("../scene/picking/InspectorSidebar", () => ({
  default: () => <div data-testid="stub-inspector" />,
}));
vi.mock("./FieldsSidebar", () => ({
  default: () => <div data-testid="stub-fields" />,
}));

// `ToggleSwitch` itself is voodo's, exercised by its own package's tests;
// stubbed here to a minimal tab-switching shim (clicking a label activates
// its content) so this test isn't coupled to its internal (HeadlessUI)
// implementation, while still covering tab selection.
vi.mock("@voxel51/voodo", () => ({
  Size: { Sm: "sm" },
  ToggleSwitch: ({
    tabs,
    tabListClassName,
    defaultIndex = 0,
  }: {
    tabs: { id: string; data: { label: string; content: ReactNode } }[];
    tabListClassName?: string;
    defaultIndex?: number;
  }) => {
    const [activeIndex, setActiveIndex] = useState(defaultIndex);
    return (
      <div>
        <div role="tablist" className={tabListClassName}>
          {tabs.map((tab, index) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveIndex(index)}
            >
              {tab.data.label}
            </button>
          ))}
        </div>
        <div>{tabs[activeIndex]?.data.content}</div>
      </div>
    );
  },
}));

describe("RightSidebar", () => {
  afterEach(() => cleanup());

  it("renders the Inspect/Fields tab switch", () => {
    render(<RightSidebar />);

    expect(screen.getByText("Inspect")).toBeTruthy();
    expect(screen.getByText("Fields")).toBeTruthy();
  });

  it("pads the tab list to match the left sidebar's edge inset", () => {
    render(<RightSidebar />);

    // Whatever `styles.tabList` resolves to (its plain source name under
    // this package's own `classNameStrategy: "non-scoped"` vitest config,
    // or a hashed name under any other), the rendered tablist must carry it.
    expect(screen.getByRole("tablist").className).toContain(styles.tabList);
  });

  it("shows the Inspect tab's content by default", () => {
    render(<RightSidebar />);

    expect(screen.getByTestId("stub-inspector")).toBeTruthy();
  });

  it("mounts FieldsSidebar when the Fields tab is selected", () => {
    render(<RightSidebar />);

    fireEvent.click(screen.getByText("Fields"));

    expect(screen.getByTestId("stub-fields")).toBeTruthy();
    expect(screen.queryByTestId("stub-inspector")).toBeNull();
  });
});
