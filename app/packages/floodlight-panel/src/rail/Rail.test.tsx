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

const grab = (onJump = vi.fn(), onDrag = vi.fn()) => {
  render(<Rail {...props} onDrag={onDrag} onJump={onJump} />);
  const rail = screen.getByRole("slider");
  const track = rail.firstElementChild as HTMLElement;
  track.getBoundingClientRect = () =>
    ({ top: 0, left: 0, height: 100, width: 10 }) as DOMRect;
  rail.getBoundingClientRect = () =>
    ({
      top: 0,
      left: 0,
      right: 10,
      bottom: 100,
      height: 100,
      width: 10,
    }) as DOMRect;
  rail.setPointerCapture = () => undefined;
  rail.releasePointerCapture = () => undefined;
  return { onDrag, onJump, rail };
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

  it("tells when a drag starts and ends, before it jumps", () => {
    const { onDrag, onJump, rail } = grab();
    fireEvent.pointerDown(rail, { clientY: 30, pointerId: 1 });
    expect(onDrag.mock.calls).toEqual([[true]]);

    fireEvent.pointerUp(rail, { clientY: 40, pointerId: 1 });
    expect(onDrag.mock.calls).toEqual([[true], [false]]);
    expect(onDrag.mock.invocationCallOrder[1]).toBeLessThan(
      onJump.mock.invocationCallOrder[0],
    );
  });

  it("labels where the pointer let go, not where it hovered before the drag", () => {
    const { rail } = grab();
    fireEvent.pointerMove(rail, { clientY: 20, pointerId: 1 });
    fireEvent.pointerDown(rail, { clientY: 20, pointerId: 1 });
    fireEvent.pointerMove(rail, { clientY: 70, pointerId: 1 });
    fireEvent.pointerUp(rail, { clientY: 70, pointerId: 1 });

    expect(screen.queryByText("at 20")).toBeNull();
    expect(screen.getByText("at 70")).toBeTruthy();
  });

  it("shows no label once a drag lets go off the rail", () => {
    const { rail } = grab();
    fireEvent.pointerMove(rail, { clientY: 20, pointerId: 1 });
    fireEvent.pointerDown(rail, { clientY: 20, pointerId: 1 });
    fireEvent.pointerUp(rail, { clientX: 400, clientY: 70, pointerId: 1 });

    expect(screen.queryByText(/^at /)).toBeNull();
  });
});
