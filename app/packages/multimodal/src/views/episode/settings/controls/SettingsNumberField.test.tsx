import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from "@testing-library/react";
import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  SettingsNumberField,
  type SettingsNumberFieldProps,
} from "./SettingsNumberField";

afterEach(() => cleanup());

// Dispatch a pointermove on window with a real movement delta (jsdom drops
// movement* from fireEvent init, so define it on the event directly).
function move(dx: number, init: MouseEventInit = {}) {
  const ev = new MouseEvent("pointermove", { bubbles: true, ...init });
  Object.defineProperty(ev, "movementX", { value: dx, configurable: true });
  act(() => {
    window.dispatchEvent(ev);
  });
}

function up() {
  act(() => {
    window.dispatchEvent(new MouseEvent("pointerup", { bubbles: true }));
  });
}

function input(): HTMLInputElement {
  return screen.getByRole("spinbutton", { name: "Value" });
}

/** Controlled harness: commits update the rendered value like a real store. */
function Harness({
  initial,
  onCommit,
  ...props
}: Omit<SettingsNumberFieldProps, "ariaLabel" | "onCommit" | "value"> & {
  readonly initial: number | null;
  readonly onCommit: (value: number | null) => void;
}) {
  const [value, setValue] = useState<number | null>(initial);
  return (
    <SettingsNumberField
      {...(props as SettingsNumberFieldProps)}
      ariaLabel="Value"
      empty={(props.empty ?? "revert") as never}
      onCommit={(next: number | null) => {
        setValue(next);
        onCommit(next);
      }}
      value={value as never}
    />
  );
}

describe("SettingsNumberField", () => {
  it("renders the formatted value read-only with its unit", () => {
    render(
      <span>
        <Harness initial={250} onCommit={vi.fn()} unit="ms" />
      </span>,
    );

    expect(input().readOnly).toBe(true);
    expect(input().value).toBe("250");
    expect(screen.getByText("ms")).toBeTruthy();
  });

  it("buffers typing in a draft and never commits a cleared field", () => {
    const onCommit = vi.fn();
    render(<Harness initial={50} onCommit={onCommit} min={0} max={100} />);

    fireEvent.pointerDown(input());
    up(); // sub-threshold press = click = begin editing
    expect(input().readOnly).toBe(false);

    fireEvent.change(input(), { target: { value: "" } });
    expect(onCommit).not.toHaveBeenCalled();

    fireEvent.change(input(), { target: { value: "75" } });
    expect(onCommit).toHaveBeenLastCalledWith(75);

    fireEvent.change(input(), { target: { value: "" } });
    fireEvent.blur(input());
    // Empty draft reverts: the display re-reads the last committed value.
    expect(input().value).toBe("75");
  });

  it("clamps committed values into range", () => {
    const onCommit = vi.fn();
    render(<Harness initial={50} onCommit={onCommit} min={0} max={100} />);

    fireEvent.pointerDown(input());
    up();
    fireEvent.change(input(), { target: { value: "150" } });

    expect(onCommit).toHaveBeenLastCalledWith(100);
  });

  it("commits null for cleared auto fields", () => {
    const onCommit = vi.fn();
    render(
      <Harness
        empty="null"
        initial={4}
        onCommit={onCommit}
        placeholder="auto"
      />,
    );

    fireEvent.pointerDown(input());
    up();
    fireEvent.change(input(), { target: { value: "" } });

    expect(onCommit).toHaveBeenLastCalledWith(null);
    fireEvent.blur(input());
    expect(input().value).toBe("");
    expect(input().placeholder).toBe("auto");
  });

  it("opens editing on keyboard focus", () => {
    const onCommit = vi.fn();
    render(<Harness initial={10} onCommit={onCommit} />);

    fireEvent.focus(input());

    expect(input().readOnly).toBe(false);
    expect(input().value).toBe("10");
  });

  it("restores the pre-edit value on Escape", () => {
    const onCommit = vi.fn();
    render(<Harness initial={10} onCommit={onCommit} />);

    fireEvent.pointerDown(input());
    up();
    fireEvent.change(input(), { target: { value: "99" } });
    expect(onCommit).toHaveBeenLastCalledWith(99);

    fireEvent.keyDown(input(), { key: "Escape" });

    expect(onCommit).toHaveBeenLastCalledWith(10);
    expect(input().readOnly).toBe(true);
  });

  it("holds blur-mode edits until Enter", () => {
    const onCommit = vi.fn();
    render(<Harness commitOn="blur" initial={10} onCommit={onCommit} />);

    fireEvent.pointerDown(input());
    up();
    fireEvent.change(input(), { target: { value: "42" } });
    expect(onCommit).not.toHaveBeenCalled();

    fireEvent.keyDown(input(), { key: "Enter" });
    expect(onCommit).toHaveBeenLastCalledWith(42);
  });

  it("nudges by one step and by ten with Shift", () => {
    const onCommit = vi.fn();
    render(<Harness initial={10} max={100} onCommit={onCommit} step={0.5} />);

    fireEvent.keyDown(input(), { key: "ArrowUp" });
    expect(onCommit).toHaveBeenLastCalledWith(10.5);

    fireEvent.keyDown(input(), { key: "ArrowUp", shiftKey: true });
    expect(onCommit).toHaveBeenLastCalledWith(15.5);

    fireEvent.keyDown(input(), { key: "ArrowDown" });
    expect(onCommit).toHaveBeenLastCalledWith(15);
  });

  it("scrubs linearly with drag, committing on release", () => {
    const onCommit = vi.fn();
    render(<Harness initial={10} max={100} min={0} onCommit={onCommit} />);

    fireEvent.pointerDown(input());
    move(40); // 40px = 10 steps at 4px/step
    up();

    expect(onCommit).toHaveBeenLastCalledWith(20);
    // Release after a drag never opens editing.
    expect(input().readOnly).toBe(true);
  });

  it("scrubs ten times finer while Shift is held", () => {
    const onCommit = vi.fn();
    render(
      <Harness initial={10} max={100} min={0} onCommit={onCommit} step={1} />,
    );

    fireEvent.pointerDown(input());
    move(40, { shiftKey: true }); // 40px at fine = 1 step
    up();

    expect(onCommit).toHaveBeenLastCalledWith(11);
  });

  it("does not scrub a null (auto) value", () => {
    const onCommit = vi.fn();
    render(<Harness empty="null" initial={null} onCommit={onCommit} />);

    fireEvent.pointerDown(input());
    move(40);
    up();

    expect(onCommit).not.toHaveBeenCalled();
  });
});
