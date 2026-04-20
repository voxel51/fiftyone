/**
 * @vitest-environment jsdom
 */
import { fireEvent, render, screen } from "@testing-library/react";
import React from "react";
import { describe, expect, it, vi } from "vitest";
import { DurationTimelineControls } from "./DurationTimelineControls";

vi.mock("../../src/views/PlaybackElements", () => ({
  FoTimelineContainer: React.forwardRef<
    HTMLDivElement,
    React.HTMLProps<HTMLDivElement>
  >(({ children, ...props }, ref) => (
    <div ref={ref} {...props}>
      {children}
    </div>
  )),
  FoTimelineControlsContainer: React.forwardRef<
    HTMLDivElement,
    React.HTMLProps<HTMLDivElement>
  >(({ children, ...props }, ref) => (
    <div ref={ref} {...props}>
      {children}
    </div>
  )),
  Seekbar: ({
    value,
    onChange,
    onSeekStart,
    onSeekEnd,
    totalFrames: _totalFrames,
    ...props
  }: {
    value: number;
    onChange: (event: React.ChangeEvent<HTMLInputElement>) => void;
    onSeekStart: () => void;
    onSeekEnd: () => void;
    totalFrames?: number;
  }) => (
    <input
      aria-label="Timeline seekbar"
      max="100"
      min="0"
      onChange={onChange}
      onMouseDown={onSeekStart}
      onMouseUp={onSeekEnd}
      type="range"
      value={value}
      {...props}
    />
  ),
  Playhead: ({
    status,
    play,
    pause,
  }: {
    status: string;
    play: () => void;
    pause: () => void;
  }) => (
    <button
      data-playhead-state={status}
      onClick={status === "playing" ? pause : play}
      type="button"
    >
      {status}
    </button>
  ),
  SeekbarThumb: ({
    shouldDisplayThumb,
    value,
  }: {
    shouldDisplayThumb: boolean;
    value: number;
  }) => (
    <div
      data-testid="seekbar-thumb"
      data-visible={String(shouldDisplayThumb)}
      data-value={value}
    />
  ),
  Speed: ({
    speed,
    setSpeed,
  }: {
    speed: number;
    setSpeed: (speed: number) => void;
  }) => (
    <input
      aria-label="Playback speed"
      max="2"
      min="0.1"
      onChange={(event) => setSpeed(Number(event.currentTarget.value))}
      step="0.1"
      type="range"
      value={speed}
    />
  ),
}));

describe("DurationTimelineControls", () => {
  it("shows buffering state and forwards seek/speed updates", () => {
    const onSeekPercentage = vi.fn();
    const onSpeedChange = vi.fn();

    render(
      <DurationTimelineControls
        currentTime={40}
        duration={100}
        formatTime={(value) => `${value}ns`}
        loaded={[[0, 50]]}
        loading={[50, 80]}
        onSeekPercentage={onSeekPercentage}
        onSpeedChange={onSpeedChange}
        onTogglePlay={vi.fn()}
        playState="buffering"
        speed={1}
        subtitle="header.stamp clock aligned across all visible panels"
        title="Synchronized playback"
      />
    );

    expect(screen.getByText("buffering")).toBeTruthy();
    expect(screen.queryByText("buffering 50ns to 80ns")).toBeNull();

    fireEvent.change(screen.getByLabelText("Timeline seekbar"), {
      target: { value: "72" },
    });
    fireEvent.change(screen.getByLabelText("Playback speed"), {
      target: { value: "1.7" },
    });

    expect(onSeekPercentage).toHaveBeenCalledWith(72);
    expect(onSpeedChange).toHaveBeenCalledWith(1.7);
    expect(screen.queryByLabelText("Step backward")).toBeNull();
    expect(screen.queryByLabelText("Step forward")).toBeNull();
  });
});
