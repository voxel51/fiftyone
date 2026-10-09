// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import PendingRunsNotice from "./PendingRunsNotice";

afterEach(cleanup);

describe("PendingRunsNotice", () => {
  it("shows the label with a spinner", () => {
    render(<PendingRunsNotice label="Building sim_a" />);

    expect(screen.getByText("Building sim_a")).toBeTruthy();
    expect(screen.getByRole("status")).toBeTruthy();
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("calls onView from the action", () => {
    const onView = vi.fn();
    render(<PendingRunsNotice label="Building" onView={onView} />);

    fireEvent.click(screen.getByRole("button", { name: "View" }));
    expect(onView).toHaveBeenCalled();
  });
});
