/**
 * @vitest-environment jsdom
 */

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import GridRail from "./GridRail";

const count: { state: string; contents?: unknown } = {
  state: "hasValue",
  contents: 100,
};

vi.mock("@fiftyone/state", () => ({ count: () => "count" }));
vi.mock("@fiftyone/reverb", () => ({
  useReverbValueLoadable: () => count,
}));

const rail = { jump: vi.fn() };

afterEach(cleanup);

describe("GridRail", () => {
  it("keeps the last total while the count reloads", () => {
    const { rerender } = render(<GridRail rail={rail} visible />);
    expect(screen.getByRole("slider").getAttribute("aria-valuemax")).toBe(
      "100",
    );

    count.state = "loading";
    count.contents = new Promise(() => undefined);
    rerender(<GridRail rail={{ ...rail }} visible />);
    expect(screen.getByRole("slider").getAttribute("aria-valuemax")).toBe(
      "100",
    );
  });
});
