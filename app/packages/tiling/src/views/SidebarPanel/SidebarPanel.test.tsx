import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import SidebarPanel from "./SidebarPanel";

describe("SidebarPanel", () => {
  afterEach(() => cleanup());

  it("renders the title and the body content", () => {
    render(
      <SidebarPanel title="Settings">
        <div data-testid="body">child</div>
      </SidebarPanel>
    );
    expect(screen.getByText("Settings")).toBeTruthy();
    expect(screen.getByTestId("body").textContent).toBe("child");
  });
});
