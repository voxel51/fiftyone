// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import HoverCard, { type HoverContent } from "./HoverCard";

afterEach(cleanup);

const CONTENT: HoverContent = {
  hit: { index: 3, id: "s3", label: "", x: 10, y: 20 },
  src: null,
  value: null,
  filename: "frame.png",
  header: { title: "camera_front" },
};

/** A stand-in for the plot canvas, which stops its own pointer events in the
 * capture phase the way the lasso overlay does */
function renderCard(
  onClose?: () => void,
  action?: { label: string; run: () => void; loading?: boolean },
) {
  const plotDown = vi.fn();
  render(
    <div
      data-testid="plot"
      onPointerDownCapture={(e) => {
        e.stopPropagation();
        plotDown();
      }}
    >
      <HoverCard
        content={CONTENT}
        origin={{ left: 0, top: 0 }}
        onClose={onClose}
        action={action}
      />
    </div>,
  );
  return { plotDown };
}

describe("HoverCard", () => {
  it("closes a pinned card on a pointerdown outside it", () => {
    const onClose = vi.fn();
    const { plotDown } = renderCard(onClose);

    fireEvent.pointerDown(screen.getByTestId("plot"));

    expect(onClose).toHaveBeenCalledTimes(1);
    // The dismissing click still reaches what it was aimed at
    expect(plotDown).toHaveBeenCalledTimes(1);
  });

  it("closes a pinned card on a pointerdown outside the panel entirely", () => {
    const onClose = vi.fn();
    renderCard(onClose);

    fireEvent.pointerDown(document.body);

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("keeps a pinned card when the pointerdown lands on the card", () => {
    const onClose = vi.fn();
    renderCard(onClose);

    fireEvent.pointerDown(screen.getByText("camera_front"));

    expect(onClose).not.toHaveBeenCalled();
  });

  it("stops closing once the card is gone", () => {
    const onClose = vi.fn();
    renderCard(onClose);
    cleanup();

    fireEvent.pointerDown(document.body);

    expect(onClose).not.toHaveBeenCalled();
  });

  it("spins the action's own button while it runs", () => {
    // The reader clicked that button and is looking at it; a notice elsewhere
    // on the plot is not where they would find out
    const run = vi.fn();
    renderCard(undefined, { label: "Find similar", run, loading: true });

    const button = screen.getByRole("button", { name: /find similar/i });
    expect(button.querySelector(".animate-spin")).toBeTruthy();
    // A second search is not another question — the first has not answered
    expect((button as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(button);
    expect(run).not.toHaveBeenCalled();
  });

  it("offers the action again once it has answered", () => {
    const run = vi.fn();
    renderCard(undefined, { label: "Find similar", run, loading: false });

    const button = screen.getByRole("button", { name: /find similar/i });
    expect(button.querySelector(".animate-spin")).toBeNull();
    fireEvent.click(button);

    expect(run).toHaveBeenCalledTimes(1);
  });

  it("leaves an unpinned card to the pointer", () => {
    renderCard(undefined);

    fireEvent.pointerDown(document.body);

    expect(screen.getByText("frame.png")).toBeTruthy();
  });
});
