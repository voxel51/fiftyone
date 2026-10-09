/**
 * @vitest-environment jsdom
 */

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import RankRail from "./RankRail";

afterEach(() => cleanup());

describe("RankRail", () => {
  it("shows loading on its track", () => {
    const { rerender } = render(<RankRail total={100} onJump={vi.fn()} />);
    const track = () => screen.getByRole("slider").firstElementChild;
    expect(track()?.getAttribute("aria-busy")).toBe("false");

    rerender(<RankRail total={100} onJump={vi.fn()} loading />);
    expect(track()?.getAttribute("aria-busy")).toBe("true");
  });
});
