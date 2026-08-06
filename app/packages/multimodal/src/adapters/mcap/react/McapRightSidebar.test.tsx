import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import styles from "./McapRightSidebar.module.css";
import McapRightSidebar from "./McapRightSidebar";

// Isolates this test to McapRightSidebar's own wiring (the tab list padding
// below, and which tab's content mounts by default) — neither sidebar's own
// content/data plumbing is relevant here and each has its own test coverage.
vi.mock("./McapInspectorSidebar", () => ({
  default: () => <div data-testid="stub-inspector" />,
}));
vi.mock("./McapFieldsSidebar", () => ({
  default: () => <div data-testid="stub-fields" />,
}));

// `ToggleSwitch` itself is voodo's, exercised by its own package's tests;
// stubbed here to a minimal tab-switching shim (clicking a label activates
// its content) so this test isn't coupled to its internal (HeadlessUI)
// implementation, while still covering tab selection.
vi.mock("@voxel51/voodo", () => ({
  Size: { Sm: "sm" },
  ToggleSwitchVariant: { Soft: "soft" },
  HeadingLevel: { H4: "h4" },
  Heading: ({ children }: { children: ReactNode }) => <h4>{children}</h4>,
  Divider: () => <hr />,
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

describe("McapRightSidebar", () => {
  afterEach(() => cleanup());

  it("renders the Inspect/Fields tab switch", () => {
    render(<McapRightSidebar />);

    expect(screen.getByText("Inspect")).toBeTruthy();
    expect(screen.getByText("Fields")).toBeTruthy();
  });

  it("pads the tab list to match the left sidebar's edge inset", () => {
    render(<McapRightSidebar />);

    // `classNameStrategy: "non-scoped"` (vitest.config.ts) resolves CSS
    // module classes to their plain source name, so this also guards against
    // the class being renamed/removed from the module without updating here.
    expect(styles.tabList).toBe("tabList");
    expect(screen.getByRole("tablist").className).toContain(styles.tabList);
  });

  it("shows the Inspect tab's content by default", () => {
    render(<McapRightSidebar />);

    expect(screen.getByTestId("stub-inspector")).toBeTruthy();
  });

  it("mounts McapFieldsSidebar when the Fields tab is selected", () => {
    render(<McapRightSidebar />);

    fireEvent.click(screen.getByText("Fields"));

    expect(screen.getByTestId("stub-fields")).toBeTruthy();
    expect(screen.queryByTestId("stub-inspector")).toBeNull();
  });
});
