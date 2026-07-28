import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import TimelinePlaybackSettings from "./TimelinePlaybackSettings";

afterEach(() => cleanup());

function expandPlayback() {
  fireEvent.click(screen.getByRole("button", { name: /Playback/ }));
}

describe("TimelinePlaybackSettings", () => {
  it("summarizes and applies a sampling preset", () => {
    const onRateChange = vi.fn();
    render(
      <TimelinePlaybackSettings onRateChange={onRateChange} rateHz={24} />,
    );

    expect(screen.getByText("Economy · 24 Hz")).toBeTruthy();
    expandPlayback();
    const select = screen.getByRole("combobox", {
      name: /Data sampling preset/,
    });
    fireEvent.focus(select);
    fireEvent.change(select, { target: { value: "smooth" } });
    fireEvent.keyDown(select, { key: "Enter" });

    expect(onRateChange).toHaveBeenCalledWith(60);
  });

  it("bounds a custom rate and waits for Apply before rebuilding playback", () => {
    const onRateChange = vi.fn();
    render(
      <TimelinePlaybackSettings onRateChange={onRateChange} rateHz={48} />,
    );

    expandPlayback();
    const input = screen.getByRole("spinbutton", {
      name: "Custom data sampling rate",
    });
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: "200" } });
    fireEvent.blur(input);

    expect(onRateChange).not.toHaveBeenCalled();
    fireEvent.click(
      screen.getByRole("button", { name: "Apply sampling rate" }),
    );
    expect(onRateChange).toHaveBeenCalledWith(120);
  });
});
