import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from "@testing-library/react";
import { useEffect } from "react";
import { afterEach, describe, expect, it } from "vitest";
import { MAX_SPEED } from "../../lib/constants";
import { achievedSpeedAtom } from "../../lib/playback/atoms";
import { PlaybackProvider } from "../../lib/playback/PlaybackProvider";
import { usePlaybackStore } from "../../lib/playback/playback-store-context";
import SpeedControl from "./SpeedControl";

// Kept in sync with the component; drag math is asserted in terms of it.
const PX_PER_DOUBLING = 130;

function renderSpeed(defaultSpeed?: number, achievedSpeed?: number) {
  return render(
    <PlaybackProvider
      duration={10}
      stepInterval={1 / 30}
      defaultSpeed={defaultSpeed}
    >
      {achievedSpeed !== undefined ? (
        <AchievedSpeedHarness value={achievedSpeed} />
      ) : null}
      <SpeedControl />
    </PlaybackProvider>,
  );
}

function AchievedSpeedHarness({ value }: { readonly value: number }) {
  const store = usePlaybackStore();
  // This effect publishes the requested achieved rate into the test store.
  useEffect(() => {
    store.set(achievedSpeedAtom, value);
  }, [store, value]);
  return null;
}

const field = () =>
  screen.getByTestId("timeline-controls-speed") as HTMLInputElement;

// Enter edit mode the way a user does: a pointer-down/up that doesn't move.
// pointer-up is dispatched on window because that's where the drag listens.
function clickToEdit() {
  fireEvent.pointerDown(field());
  fireEvent.pointerUp(window);
}

// Simulate a vertical scrub of `dy` pixels (negative = up = faster). jsdom
// drops `movementY` from fireEvent init, so dispatch an event with it defined.
function scrub(dy: number) {
  fireEvent.pointerDown(field());
  const move = new MouseEvent("pointermove", { bubbles: true });
  Object.defineProperty(move, "movementY", { value: dy, configurable: true });
  // Wrap the native dispatch so the setSpeed it triggers is flushed by React.
  act(() => {
    window.dispatchEvent(move);
  });
  fireEvent.pointerUp(window);
}

describe("SpeedControl", () => {
  afterEach(() => cleanup());

  it("shows 1× by default", () => {
    renderSpeed();
    expect(field().value).toBe("1×");
  });

  it("reflects a non-default initial speed", () => {
    renderSpeed(2);
    expect(field().value).toBe("2×");
  });

  it("shows the achieved rate when requested speed is under-delivered", () => {
    renderSpeed(4, 3.1);

    const achievedRate = screen.getByTestId("timeline-controls-achieved-speed");
    expect(achievedRate.textContent).toBe("actual 3.1×");
    expect(achievedRate.title).toBe("Requested 4×; currently achieving 3.1×");
    expect(achievedRate.getAttribute("aria-live")).toBe("polite");
  });

  it("does not add noise when achieved speed is close to requested", () => {
    renderSpeed(4, 3.8);

    expect(screen.queryByTestId("timeline-controls-achieved-speed")).toBeNull();
  });

  it("is read-only until clicked, then editable", () => {
    renderSpeed();
    expect(field().readOnly).toBe(true);
    clickToEdit();
    expect(field().readOnly).toBe(false);
    // Editing shows the bare number so the × doesn't get in the way.
    expect(field().value).toBe("1");
  });

  it("commits a typed value on Enter", () => {
    renderSpeed();
    clickToEdit();
    fireEvent.change(field(), { target: { value: "2.5" } });
    fireEvent.keyDown(field(), { key: "Enter" });
    expect(field().value).toBe("2.5×");
    expect(field().readOnly).toBe(true);
  });

  it("commits on blur", () => {
    renderSpeed();
    clickToEdit();
    fireEvent.change(field(), { target: { value: "3" } });
    fireEvent.blur(field());
    expect(field().value).toBe("3×");
  });

  it("reverts to the committed value on Escape", () => {
    renderSpeed(2);
    clickToEdit();
    fireEvent.change(field(), { target: { value: "5" } });
    fireEvent.keyDown(field(), { key: "Escape" });
    expect(field().value).toBe("2×");
  });

  it("parses a value with a trailing × or x", () => {
    renderSpeed();
    clickToEdit();
    fireEvent.change(field(), { target: { value: "4x" } });
    fireEvent.keyDown(field(), { key: "Enter" });
    expect(field().value).toBe("4×");
  });

  it("reverts when the typed value is invalid", () => {
    renderSpeed(2);
    clickToEdit();
    fireEvent.change(field(), { target: { value: "abc" } });
    fireEvent.keyDown(field(), { key: "Enter" });
    expect(field().value).toBe("2×");
  });

  it("clamps a value above MAX_SPEED down to the ceiling", () => {
    renderSpeed();
    clickToEdit();
    fireEvent.change(field(), { target: { value: "50" } });
    fireEvent.keyDown(field(), { key: "Enter" });
    expect(field().value).toBe(`${MAX_SPEED}×`);
  });

  it("allows any small positive value (no 0.1 floor)", () => {
    renderSpeed();
    clickToEdit();
    fireEvent.change(field(), { target: { value: "0.05" } });
    fireEvent.keyDown(field(), { key: "Enter" });
    expect(field().value).toBe("0.05×");
  });

  it("scrubbing up increases speed multiplicatively", () => {
    renderSpeed(1);
    // One doubling's worth of upward travel → 2×.
    scrub(-PX_PER_DOUBLING);
    expect(field().value).toBe("2×");
  });

  it("scrubbing down decreases speed and does not enter edit mode", () => {
    renderSpeed(2);
    // One doubling's worth of downward travel → 1×.
    scrub(PX_PER_DOUBLING);
    expect(field().value).toBe("1×");
    expect(field().readOnly).toBe(true);
  });

  it("double-click resets to 1×", () => {
    renderSpeed(3);
    fireEvent.doubleClick(field());
    expect(field().value).toBe("1×");
  });

  it("arrow keys nudge the committed speed", () => {
    renderSpeed(1);
    fireEvent.keyDown(field(), { key: "ArrowUp" });
    // 1 × 1.1 = 1.1
    expect(field().value).toBe("1.1×");
    fireEvent.keyDown(field(), { key: "ArrowDown" });
    // 1.1 × 1.1^-1 = 1 (rounded to 2dp)
    expect(field().value).toBe("1×");
  });

  it("exposes spinbutton semantics for accessibility", () => {
    renderSpeed(2);
    const el = field();
    expect(el.getAttribute("role")).toBe("spinbutton");
    expect(el.getAttribute("aria-valuenow")).toBe("2");
    expect(el.getAttribute("aria-valuemax")).toBe(String(MAX_SPEED));
  });
});
