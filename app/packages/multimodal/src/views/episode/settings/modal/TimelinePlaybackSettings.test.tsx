import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import TimelinePlaybackSettings from "./TimelinePlaybackSettings";

afterEach(() => cleanup());

function expandPlayback() {
  fireEvent.click(screen.getByRole("button", { name: /Playback/ }));
}

function selectSamplingPreset(value: string) {
  const select = screen.getByRole("combobox", {
    name: /Data sampling preset/,
  });
  fireEvent.focus(select);
  fireEvent.change(select, { target: { value } });
  fireEvent.keyDown(select, { key: "Enter" });
}

function inputValue(element: HTMLElement): string {
  if (!(element instanceof HTMLInputElement)) {
    throw new Error("expected an input element");
  }
  return element.value;
}

function ControlledTimelinePlaybackSettings({
  initialRateHz,
  onRateChange,
}: {
  readonly initialRateHz: number;
  readonly onRateChange: (rateHz: number) => void;
}) {
  const [rateHz, setRateHz] = useState(initialRateHz);
  return (
    <TimelinePlaybackSettings
      onRateChange={(nextRateHz) => {
        onRateChange(nextRateHz);
        setRateHz(nextRateHz);
      }}
      rateHz={rateHz}
    />
  );
}

describe("TimelinePlaybackSettings", () => {
  it("summarizes and applies a sampling preset", () => {
    const onRateChange = vi.fn();
    render(
      <TimelinePlaybackSettings onRateChange={onRateChange} rateHz={24} />,
    );

    expect(screen.getByText("Economy · 24 Hz")).toBeTruthy();
    expandPlayback();
    selectSamplingPreset("smooth");

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

  it("restores externally committed presets over a custom draft", () => {
    const onRateChange = vi.fn();
    const { rerender } = render(
      <TimelinePlaybackSettings onRateChange={onRateChange} rateHz={48} />,
    );
    expandPlayback();
    const input = screen.getByRole("spinbutton", {
      name: "Custom data sampling rate",
    });
    fireEvent.change(input, { target: { value: "75" } });
    fireEvent.blur(input);

    rerender(
      <TimelinePlaybackSettings onRateChange={onRateChange} rateHz={24} />,
    );

    expect(
      inputValue(
        screen.getByRole("combobox", {
          name: /Data sampling preset/,
        }),
      ),
    ).toBe("Economy · 24 Hz");
    expect(
      screen.queryByRole("spinbutton", {
        name: "Custom data sampling rate",
      }),
    ).toBeNull();
    expect(onRateChange).not.toHaveBeenCalled();
  });

  it("moves between preset and custom controls through committed rates", () => {
    const onRateChange = vi.fn();
    render(
      <ControlledTimelinePlaybackSettings
        initialRateHz={30}
        onRateChange={onRateChange}
      />,
    );
    expandPlayback();

    selectSamplingPreset("custom");
    expect(
      inputValue(
        screen.getByRole("spinbutton", {
          name: "Custom data sampling rate",
        }),
      ),
    ).toBe("30");

    selectSamplingPreset("smooth");
    expect(onRateChange).toHaveBeenCalledWith(60);
    expect(
      inputValue(
        screen.getByRole("combobox", {
          name: /Data sampling preset/,
        }),
      ),
    ).toBe("Smooth · 60 Hz");
    expect(
      screen.queryByRole("spinbutton", {
        name: "Custom data sampling rate",
      }),
    ).toBeNull();

    selectSamplingPreset("custom");
    expect(
      inputValue(
        screen.getByRole("spinbutton", {
          name: "Custom data sampling rate",
        }),
      ),
    ).toBe("60");
  });

  it("preserves an unapplied custom draft across same-rate rerenders", () => {
    const onRateChange = vi.fn();
    const { rerender } = render(
      <TimelinePlaybackSettings onRateChange={onRateChange} rateHz={48} />,
    );
    expandPlayback();
    const input = screen.getByRole("spinbutton", {
      name: "Custom data sampling rate",
    });
    fireEvent.change(input, { target: { value: "75" } });
    fireEvent.blur(input);

    rerender(
      <TimelinePlaybackSettings onRateChange={onRateChange} rateHz={48} />,
    );

    expect(
      inputValue(
        screen.getByRole("spinbutton", {
          name: "Custom data sampling rate",
        }),
      ),
    ).toBe("75");
    expect(onRateChange).not.toHaveBeenCalled();
  });

  it("works without a provider and resets the draft on remount", () => {
    const onRateChange = vi.fn();
    const first = render(
      <TimelinePlaybackSettings onRateChange={onRateChange} rateHz={48} />,
    );
    expandPlayback();
    const input = screen.getByRole("spinbutton", {
      name: "Custom data sampling rate",
    });
    fireEvent.change(input, { target: { value: "75" } });
    fireEvent.blur(input);
    first.unmount();

    render(
      <TimelinePlaybackSettings onRateChange={onRateChange} rateHz={48} />,
    );
    expandPlayback();

    expect(
      inputValue(
        screen.getByRole("spinbutton", {
          name: "Custom data sampling rate",
        }),
      ),
    ).toBe("48");
    expect(onRateChange).not.toHaveBeenCalled();
  });
});
