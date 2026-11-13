// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@fiftyone/components", () => ({
  PendingRunsNotice: ({
    label,
    viewLabel,
    onView,
  }: {
    label: string;
    viewLabel: string;
    onView: () => void;
  }) => (
    <div>
      {label}
      <button onClick={onView}>{viewLabel}</button>
    </div>
  ),
}));

import PendingIndexNotice from "./PendingIndexNotice";

const run = (brain_key: string, run_state = "running") => ({
  id: brain_key,
  brain_key,
  run_state,
  label: null,
  operator: "op",
});

afterEach(cleanup);

describe("PendingIndexNotice", () => {
  it("uses the singular for one index in progress", () => {
    render(<PendingIndexNotice runs={[run("sim_a")]} onView={vi.fn()} />);

    expect(
      screen.getByText("There is 1 similarity index in progress"),
    ).toBeTruthy();
  });

  it("counts several indexes and opens the index page", () => {
    const onView = vi.fn();
    render(
      <PendingIndexNotice
        runs={[run("sim_a"), run("sim_b", "queued")]}
        onView={onView}
      />,
    );

    expect(
      screen.getByText("There are 2 similarity indexes in progress"),
    ).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "View indexes" }));
    expect(onView).toHaveBeenCalled();
  });

  it("shows nothing when only failed runs remain", () => {
    const { container } = render(
      <PendingIndexNotice runs={[run("sim_a", "failed")]} onView={vi.fn()} />,
    );

    expect(container.textContent).toBe("");
  });
});
