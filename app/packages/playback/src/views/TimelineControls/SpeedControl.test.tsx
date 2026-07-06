import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { PlaybackProvider } from "../../lib/playback/PlaybackProvider";
import SpeedControl, { SPEED_PRESETS } from "./SpeedControl";

function renderSpeed(defaultSpeed?: number) {
  return render(
    <PlaybackProvider
      duration={10}
      stepInterval={1 / 30}
      defaultSpeed={defaultSpeed}
    >
      <SpeedControl />
    </PlaybackProvider>
  );
}

const trigger = () => screen.getByTestId("timeline-controls-speed");

describe("SpeedControl", () => {
  afterEach(() => cleanup());

  it("shows 1× by default", () => {
    renderSpeed();
    expect(trigger().textContent).toContain("1×");
  });

  it("reflects a non-default initial speed", () => {
    renderSpeed(2);
    expect(trigger().textContent).toContain("2×");
  });

  it("opens a menu with every preset speed", () => {
    renderSpeed();
    fireEvent.click(trigger());
    for (const n of SPEED_PRESETS) {
      expect(
        screen.getByTestId(`timeline-controls-speed-option-${n}`)
      ).toBeTruthy();
    }
  });

  it("selecting a preset updates the active speed", () => {
    renderSpeed();
    fireEvent.click(trigger());
    fireEvent.click(screen.getByTestId("timeline-controls-speed-option-2"));
    expect(trigger().textContent).toContain("2×");
  });

  it("supports the fractional 0.25× preset", () => {
    renderSpeed();
    fireEvent.click(trigger());
    fireEvent.click(screen.getByTestId("timeline-controls-speed-option-0.25"));
    expect(trigger().textContent).toContain("0.25×");
  });

  it("offers exactly the documented presets", () => {
    expect([...SPEED_PRESETS]).toEqual([0.25, 0.5, 1, 1.5, 2, 3]);
  });
});
