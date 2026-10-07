import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useBackdropDismiss } from "./useBackdropDismiss";

const Dialog = ({ onDismiss }: { onDismiss: () => void }) => {
  const handlers = useBackdropDismiss(onDismiss);
  return (
    <div data-testid="backdrop" {...handlers}>
      <div data-testid="dialog">
        <input data-testid="min" />
      </div>
    </div>
  );
};

describe("useBackdropDismiss", () => {
  afterEach(cleanup);

  it("dismisses on a click outside the dialog", () => {
    const onDismiss = vi.fn();
    render(<Dialog onDismiss={onDismiss} />);
    const backdrop = screen.getByTestId("backdrop");

    fireEvent.mouseDown(backdrop);
    fireEvent.click(backdrop);

    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it("does not dismiss a drag from an input released over the backdrop", () => {
    // e.g. selecting the input's text by dragging past the dialog's edge:
    // the browser fires the click on the backdrop
    const onDismiss = vi.fn();
    render(<Dialog onDismiss={onDismiss} />);

    fireEvent.mouseDown(screen.getByTestId("min"));
    fireEvent.click(screen.getByTestId("backdrop"));

    expect(onDismiss).not.toHaveBeenCalled();
  });

  it("does not dismiss on a click inside the dialog", () => {
    const onDismiss = vi.fn();
    render(<Dialog onDismiss={onDismiss} />);
    const min = screen.getByTestId("min");

    fireEvent.mouseDown(min);
    fireEvent.click(min);

    expect(onDismiss).not.toHaveBeenCalled();
  });

  it("does not carry a backdrop press over to a later click", () => {
    const onDismiss = vi.fn();
    render(<Dialog onDismiss={onDismiss} />);
    const backdrop = screen.getByTestId("backdrop");

    // pressed on the backdrop, released inside (no click on the backdrop)
    fireEvent.mouseDown(backdrop);
    fireEvent.click(screen.getByTestId("min"));
    // then a drag from the input released over the backdrop
    fireEvent.mouseDown(screen.getByTestId("min"));
    fireEvent.click(backdrop);

    expect(onDismiss).not.toHaveBeenCalled();
  });
});
