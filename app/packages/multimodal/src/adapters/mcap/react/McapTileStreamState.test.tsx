import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { McapTileEmptyState } from "./McapTileStreamState";

afterEach(() => {
  cleanup();
});

describe("McapTileEmptyState", () => {
  it("shows a deterministic empty-source message for empty topics", () => {
    render(<McapTileEmptyState topic="" />);

    expect(screen.getByTestId("mcap-tile-empty-state").textContent).toBe(
      "No source available"
    );
  });
});
