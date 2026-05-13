import {
  cleanup,
  createEvent,
  fireEvent,
  render,
  screen,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PlaybackProvider } from "../../lib/playback/PlaybackProvider";
import SimplePlaybackBar from "./SimplePlaybackBar";
import styles from "./SimplePlaybackBar.module.css";

// jsdom's PointerEvent constructor doesn't propagate offsetX/Y from its
// init object, so build the event and patch the property directly. The
// component reads `nativeEvent.offsetX` so the value lands on the right
// surface.
function pointerDown(el: Element, offsetX: number) {
  const e = createEvent.pointerDown(el);
  Object.defineProperty(e, "offsetX", { value: offsetX, configurable: true });
  fireEvent(el, e);
}

function pointerMove(el: Element, offsetX: number, buttons = 1) {
  const e = createEvent.pointerMove(el);
  Object.defineProperty(e, "offsetX", { value: offsetX, configurable: true });
  Object.defineProperty(e, "buttons", { value: buttons, configurable: true });
  fireEvent(el, e);
}

function renderBar(duration = 10) {
  return render(
    <PlaybackProvider duration={duration} stepInterval={1 / 30}>
      <SimplePlaybackBar />
    </PlaybackProvider>
  );
}

describe("SimplePlaybackBar", () => {
  beforeEach(() => {
    // jsdom reports clientWidth = 0 (no layout engine). Stub a deterministic
    // 100px track width so the ratio math (offsetX / clientWidth) lines up.
    vi.spyOn(
      Element.prototype,
      "clientWidth",
      "get"
    ).mockReturnValue(100);
    // setPointerCapture is also missing in jsdom.
    Element.prototype.setPointerCapture = vi.fn();
  });

  afterEach(() => cleanup());

  it("renders a play button when paused", () => {
    renderBar();
    expect(screen.getByRole("button", { name: "Play" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Pause" })).toBeNull();
  });

  it("toggles to a pause button after the user clicks play", () => {
    renderBar();
    fireEvent.click(screen.getByRole("button", { name: "Play" }));
    expect(screen.getByRole("button", { name: "Pause" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Play" })).toBeNull();
  });

  it("toggles back to play after the user clicks pause", () => {
    renderBar();
    fireEvent.click(screen.getByRole("button", { name: "Play" }));
    fireEvent.click(screen.getByRole("button", { name: "Pause" }));
    expect(screen.getByRole("button", { name: "Play" })).toBeTruthy();
  });

  it("renders the PlayheadTime readout (currentTime / duration)", () => {
    renderBar(8);
    // PlayheadTime uses the centisecond formatTime helper.
    expect(screen.getByText("0:00.00 / 0:08.00")).toBeTruthy();
  });

  it("seeks to the pointer position when the track is clicked", () => {
    const { container } = renderBar(10);
    const track = container.querySelector<HTMLDivElement>(`.${styles.track}`);
    expect(track).not.toBeNull();
    // Track is 100px wide → clicking at x=25 → 25% → 2.5s of a 10s timeline.
    pointerDown(track!, 25);
    expect(screen.getByText("0:02.50 / 0:10.00")).toBeTruthy();
  });

  it("clamps pointer-down past the track width to 100% (seek end)", () => {
    const { container } = renderBar(10);
    const track = container.querySelector<HTMLDivElement>(`.${styles.track}`);
    pointerDown(track!, 250);
    expect(screen.getByText("0:10.00 / 0:10.00")).toBeTruthy();
  });

  it("clamps pointer-down before the track origin to 0% (seek start)", () => {
    const { container } = renderBar(10);
    const track = container.querySelector<HTMLDivElement>(`.${styles.track}`);
    pointerDown(track!, -50);
    expect(screen.getByText("0:00.00 / 0:10.00")).toBeTruthy();
  });

  it("scrubs while the pointer is held down and moved", () => {
    const { container } = renderBar(10);
    const track = container.querySelector<HTMLDivElement>(`.${styles.track}`);
    pointerDown(track!, 10);
    // buttons=1 → primary button held.
    pointerMove(track!, 70, 1);
    expect(screen.getByText("0:07.00 / 0:10.00")).toBeTruthy();
  });

  it("ignores pointermove when no buttons are pressed", () => {
    const { container } = renderBar(10);
    const track = container.querySelector<HTMLDivElement>(`.${styles.track}`);
    pointerDown(track!, 10);
    pointerMove(track!, 80, 0);
    // Position should reflect the pointerDown (10%), not the hover (80%).
    expect(screen.getByText("0:01.00 / 0:10.00")).toBeTruthy();
  });

  it("positions the fill and handle to match the seek ratio", () => {
    const { container } = renderBar(10);
    const track = container.querySelector<HTMLDivElement>(`.${styles.track}`);
    pointerDown(track!, 40);
    const fill = container.querySelector(`.${styles.fill}`);
    const handle = container.querySelector(`.${styles.handle}`);
    expect(fill).not.toBeNull();
    expect(handle).not.toBeNull();
    expect(handle!.getAttribute("style") ?? "").toContain("left: 40%");
    expect(fill!.getAttribute("style") ?? "").toContain("40%");
  });

  it("ignores pointer-down when duration is 0 (no usable timeline)", () => {
    const { container } = renderBar(0);
    const track = container.querySelector<HTMLDivElement>(`.${styles.track}`);
    pointerDown(track!, 50);
    // Readout stays at the zero baseline; no NaN, no throw.
    expect(screen.getByText("0:00.00 / 0:00.00")).toBeTruthy();
  });
});
