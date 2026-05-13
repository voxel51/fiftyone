import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import * as voodoMock from "../../__tests__/voodo-mock";

vi.mock("@voxel51/voodo", () => voodoMock);

// eslint-disable-next-line import/first
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
