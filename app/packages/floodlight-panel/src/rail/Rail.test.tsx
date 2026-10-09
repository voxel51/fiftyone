/**
 * @vitest-environment jsdom
 */

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import Rail from "./Rail";

afterEach(() => cleanup());

// jsdom's PointerEvent drops coordinates; a MouseEvent carries them
class CoordinatePointerEvent extends MouseEvent {
  readonly pointerId: number;
  constructor(type: string, init: PointerEventInit = {}) {
    super(type, init);
    this.pointerId = init.pointerId ?? 0;
  }
}
window.PointerEvent = CoordinatePointerEvent as typeof PointerEvent;

const props = {
  label: (position: number) => `at ${Math.round(position * 100)}`,
  span: 0.04,
  ticks: [
    { position: 0, label: "2020" },
    { position: 0.5, label: "2022" },
  ],
};

const grab = (onJump = vi.fn()) => {
  render(<Rail {...props} onJump={onJump} />);
  const rail = screen.getByRole("slider");
  const track = rail.firstElementChild as HTMLElement;
  track.getBoundingClientRect = () =>
    ({ top: 0, left: 0, height: 100, width: 10 }) as DOMRect;
  rail.setPointerCapture = () => undefined;
  rail.releasePointerCapture = () => undefined;
  return { onJump, rail };
};

describe("Rail", () => {
  it("shows loading on its track", () => {
    const { rerender } = render(<Rail {...props} onJump={vi.fn()} />);
    const track = () => screen.getByRole("slider").firstElementChild;
    expect(track()?.getAttribute("aria-busy")).toBe("false");

    rerender(<Rail {...props} onJump={vi.fn()} loading />);
    expect(track()?.getAttribute("aria-busy")).toBe("true");
  });

  it("renders a marker per tick", () => {
    const { rail } = grab();
    expect(rail.querySelectorAll("[style]").length).toBeGreaterThanOrEqual(2);
  });

  it("jumps nowhere while dragging, and once on release", () => {
    const { onJump, rail } = grab();

    fireEvent.pointerDown(rail, { clientY: 10, pointerId: 1 });
    for (let y = 10; y <= 90; y += 5) {
      fireEvent.pointerMove(rail, { clientY: y, pointerId: 1 });
    }
    expect(onJump).not.toHaveBeenCalled();

    fireEvent.pointerUp(rail, { clientY: 90, pointerId: 1 });
    expect(onJump).toHaveBeenCalledTimes(1);
    expect(onJump).toHaveBeenCalledWith(0.9);
  });

  it("labels the dragged position", () => {
    const { rail } = grab();
    fireEvent.pointerDown(rail, { clientY: 30, pointerId: 1 });
    expect(rail.getAttribute("aria-valuetext")).toBe("at 30");
    expect(screen.getByText("at 30")).toBeTruthy();
  });
});
