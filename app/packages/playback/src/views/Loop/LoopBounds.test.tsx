import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { PlaybackProvider } from "../../lib/PlaybackProvider";
import LoopBounds from "./LoopBounds";

function renderInProvider(opts: {
  duration: number;
  defaultLoopStart?: number;
  defaultLoopEnd?: number;
}) {
  return render(
    <PlaybackProvider
      duration={opts.duration}
      stepInterval={1 / 30}
      defaultLoopStart={opts.defaultLoopStart}
      defaultLoopEnd={opts.defaultLoopEnd}
    >
      <LoopBounds />
    </PlaybackProvider>
  );
}

describe("LoopBounds", () => {
  afterEach(() => cleanup());

  it("renders nothing when the loop spans the full timeline", () => {
    const { container } = renderInProvider({ duration: 10 });
    expect(container.textContent).toBe("");
  });

  it("renders the bounds when only loop start has moved", () => {
    renderInProvider({ duration: 10, defaultLoopStart: 2.5 });
    expect(screen.getByText("2.50s")).toBeTruthy();
    expect(screen.getByText("10.00s")).toBeTruthy();
  });

  it("renders the bounds when only loop end has moved", () => {
    renderInProvider({ duration: 10, defaultLoopEnd: 7.5 });
    expect(screen.getByText("0.00s")).toBeTruthy();
    expect(screen.getByText("7.50s")).toBeTruthy();
  });

  it("renders the bounds when both have moved", () => {
    renderInProvider({
      duration: 10,
      defaultLoopStart: 1.25,
      defaultLoopEnd: 8.75,
    });
    expect(screen.getByText("1.25s")).toBeTruthy();
    expect(screen.getByText("8.75s")).toBeTruthy();
  });

  it("treats bounds within LOOP_EDGE_EPSILON as at the edge", () => {
    // loopStart = 0.01 (< 0.02 epsilon) → "at edge", loopEnd = 5 (moved)
    // → loopMoved still true because loopEnd is not at edge, so we render.
    renderInProvider({
      duration: 10,
      defaultLoopStart: 0.01,
      defaultLoopEnd: 5,
    });
    expect(screen.getByText("0.01s")).toBeTruthy();
    expect(screen.getByText("5.00s")).toBeTruthy();
  });

  it("renders nothing when both bounds sit within EPSILON of their edges", () => {
    // Both within 0.02 of their edges → both atEdge → no render.
    const { container } = renderInProvider({
      duration: 10,
      defaultLoopStart: 0.005,
      defaultLoopEnd: 9.995,
    });
    expect(container.textContent).toBe("");
  });

  it("resets loop start to 0 when the start readout is clicked", () => {
    renderInProvider({
      duration: 10,
      defaultLoopStart: 2.5,
      defaultLoopEnd: 8,
    });
    fireEvent.click(screen.getByText("2.50s"));
    // After reset, start is at 0 (atStart=true) but end is still 8 (not atEnd),
    // so the component re-renders showing "0.00s / 8.00s".
    expect(screen.getByText("0.00s")).toBeTruthy();
    expect(screen.getByText("8.00s")).toBeTruthy();
    expect(screen.queryByText("2.50s")).toBeNull();
  });

  it("resets loop end to duration when the end readout is clicked", () => {
    renderInProvider({
      duration: 10,
      defaultLoopStart: 2.5,
      defaultLoopEnd: 8,
    });
    fireEvent.click(screen.getByText("8.00s"));
    expect(screen.getByText("2.50s")).toBeTruthy();
    expect(screen.getByText("10.00s")).toBeTruthy();
    expect(screen.queryByText("8.00s")).toBeNull();
  });

  it("unmounts when both bounds get reset back to the edges", () => {
    const { container } = renderInProvider({
      duration: 10,
      defaultLoopStart: 2.5,
      defaultLoopEnd: 8,
    });
    fireEvent.click(screen.getByText("2.50s"));
    fireEvent.click(screen.getByText("8.00s"));
    expect(container.textContent).toBe("");
  });

  it("each bound exposes a reset-button title and role for a11y", () => {
    renderInProvider({
      duration: 10,
      defaultLoopStart: 2,
      defaultLoopEnd: 7,
    });
    expect(screen.getByTitle("Reset loop start to 0")).toBeTruthy();
    expect(screen.getByTitle("Reset loop end to duration")).toBeTruthy();
    expect(screen.getAllByRole("button")).toHaveLength(2);
  });
});
