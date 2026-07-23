// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { FloatingPanel } from "./FloatingPanel";

// RTL only auto-cleans up with vitest globals enabled; ours are off
afterEach(cleanup);

describe("FloatingPanel", () => {
  it("collapses to the header and back via the chevron", () => {
    render(
      <FloatingPanel title="legend" footer="hint">
        content
      </FloatingPanel>,
    );

    fireEvent.click(screen.getByLabelText("Collapse"));
    expect(screen.queryByText("content")).toBeNull();
    expect(screen.queryByText("hint")).toBeNull();

    fireEvent.click(screen.getByLabelText("Expand"));
    expect(screen.getByText("content")).toBeDefined();
    expect(screen.getByText("hint")).toBeDefined();
  });

  it("swaps the CSS anchor for pixel coordinates once dragged", () => {
    const { container } = render(
      <FloatingPanel title="legend">content</FloatingPanel>,
    );
    const panel = container.firstElementChild as HTMLElement;
    expect(panel.style.left).toContain("calc");

    // jsdom has no layout, so useDraggable clamps to its 0-width parent
    // — the point here is the wiring: grip drag converts the anchor to
    // pixel coordinates, and drag-end stops tracking
    fireEvent.mouseDown(screen.getByLabelText("Drag to reposition"), {
      clientX: 100,
      clientY: 100,
    });
    fireEvent.mouseMove(document, { clientX: 120, clientY: 130 });
    fireEvent.mouseUp(document);

    expect(panel.style.left).toBe("0px");
    expect(panel.style.top).toBe("0px");

    fireEvent.mouseMove(document, { clientX: 500, clientY: 500 });
    expect(panel.style.left).toBe("0px");
  });

  it("keeps pointer gestures off the surface underneath", () => {
    const onPointerDown = vi.fn();
    render(
      <div onPointerDown={onPointerDown}>
        <FloatingPanel title="legend">content</FloatingPanel>
      </div>,
    );

    fireEvent.pointerDown(screen.getByText("content"));
    expect(onPointerDown).not.toHaveBeenCalled();
  });
});
