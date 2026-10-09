/**
 * @vitest-environment jsdom
 */

import { cleanup, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import Sort from "./Sort";

const values: Record<string, unknown> = {
  fields: ["created_at"],
  pending: false,
  qp: false,
  sim: null,
  sortBy: { field: "created_at", descending: false },
};

vi.mock("@fiftyone/state", () => ({
  gridSortBy: "sortBy",
  gridSortFields: "fields",
  gridSortPending: "pending",
  queryPerformance: "qp",
  similarityParameters: "sim",
}));

vi.mock("@fiftyone/reverb", () => ({
  useReverbValue: (state: string) => values[state],
  useReverbState: (state: string) => [values[state], vi.fn()],
}));

vi.mock("@fiftyone/actions", () => ({
  ToolbarAction: ({ label }: { label: ReactNode }) => <button>{label}</button>,
}));

afterEach(() => {
  cleanup();
  values.pending = false;
});

describe("Sort", () => {
  it("shows the sort is loading while the grid lays it out", () => {
    render(<Sort />);
    expect(screen.queryByLabelText("Sorting")).toBeNull();

    cleanup();
    values.pending = true;
    render(<Sort />);
    expect(screen.getByLabelText("Sorting")).toBeTruthy();
  });
});
