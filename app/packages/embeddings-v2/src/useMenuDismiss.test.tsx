// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useRef, useState } from "react";
import { useMenuDismiss } from "./useMenuDismiss";

afterEach(cleanup);

/** A menu beside a stand-in for the plot, which clears on any pointerdown the
 * way the chart's background-click path does */
function Harness({ onPlotDown }: { onPlotDown: () => void }) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  useMenuDismiss(open, rootRef, () => setOpen(false));
  return (
    <div>
      <div ref={rootRef}>
        <button onClick={() => setOpen(true)}>open</button>
        {open && <div role="menu">menu</div>}
      </div>
      {/* capture phase, as the lasso overlay listens */}
      <div
        data-testid="plot"
        onPointerDownCapture={onPlotDown}
        style={{ width: 100, height: 100 }}
      />
    </div>
  );
}

describe("useMenuDismiss", () => {
  it("closes on an outside pointerdown", () => {
    render(<Harness onPlotDown={vi.fn()} />);
    fireEvent.click(screen.getByText("open"));

    fireEvent.pointerDown(screen.getByTestId("plot"));

    expect(screen.queryByRole("menu")).toBeNull();
  });

  it("spends the dismissing click, so the plot never sees it", () => {
    const onPlotDown = vi.fn();
    render(<Harness onPlotDown={onPlotDown} />);
    fireEvent.click(screen.getByText("open"));

    fireEvent.pointerDown(screen.getByTestId("plot"));

    // Reaching the plot means empty space, which means "clear" — and closing
    // a menu would silently discard the selection or a text search
    expect(onPlotDown).not.toHaveBeenCalled();
  });

  it("leaves the plot alone to handle clicks when no menu is open", () => {
    const onPlotDown = vi.fn();
    render(<Harness onPlotDown={onPlotDown} />);

    fireEvent.pointerDown(screen.getByTestId("plot"));

    expect(onPlotDown).toHaveBeenCalledTimes(1);
  });

  it("does not swallow clicks landing inside the menu itself", () => {
    render(<Harness onPlotDown={vi.fn()} />);
    fireEvent.click(screen.getByText("open"));

    fireEvent.pointerDown(screen.getByRole("menu"));

    expect(screen.getByRole("menu")).toBeTruthy();
  });

  it("closes on Escape", () => {
    // A competing bubble-phase document listener, like useSelectionBridge's
    // own Escape handler that clears the plot's lasso/grid selection
    const otherKeydown = vi.fn();
    document.addEventListener("keydown", otherKeydown);
    render(<Harness onPlotDown={vi.fn()} />);
    fireEvent.click(screen.getByText("open"));

    fireEvent.keyDown(screen.getByText("open"), { key: "Escape" });

    expect(screen.queryByRole("menu")).toBeNull();
    // Dismissing the menu must own this Escape — it must not also reach a
    // sibling bubble-phase handler
    expect(otherKeydown).not.toHaveBeenCalled();
    document.removeEventListener("keydown", otherKeydown);
  });
});
