/**
 * @vitest-environment jsdom
 */

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
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

  it("a drag jumps once, on release, wherever it moved", () => {
    const onJump = vi.fn();
    render(<RankRail total={100} onJump={onJump} />);
    const rail = screen.getByRole("slider");
    const track = rail.firstElementChild as HTMLElement;
    track.getBoundingClientRect = () =>
      ({ top: 0, left: 0, height: 100, width: 10 }) as DOMRect;
    rail.setPointerCapture = () => undefined;
    rail.releasePointerCapture = () => undefined;

    fireEvent.pointerDown(rail, { clientY: 10, pointerId: 1 });
    for (let y = 10; y <= 90; y += 5) {
      fireEvent.pointerMove(rail, { clientY: y, pointerId: 1 });
    }
    expect(onJump).not.toHaveBeenCalled();

    fireEvent.pointerUp(rail, { clientY: 90, pointerId: 1 });
    expect(onJump).toHaveBeenCalledTimes(1);
  });
});
