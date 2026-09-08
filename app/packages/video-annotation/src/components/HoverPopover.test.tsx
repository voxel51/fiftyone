/**
 * Copyright 2017-2026, Voxel51, Inc.
 */

import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { CLOSE_DELAY_MS, HoverPopover } from "./HoverPopover";

const subject = () => (
  <HoverPopover label="Status" content={<div>the card</div>}>
    <button disabled>trigger</button>
  </HoverPopover>
);

// The trigger is disabled — it swallows its own pointer events, so the hover
// lands on the wrapper span. `mouseOver` bubbles, so React synthesizes the
// enter event the wrapper listens for.
const hoverTrigger = () => fireEvent.mouseOver(screen.getByText("trigger"));

const leave = (element: Element) => fireEvent.mouseOut(element);

const settle = (ms: number) =>
  act(() => {
    vi.advanceTimersByTime(ms);
  });

describe("HoverPopover", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  it("opens the card on hover and closes it after the leave delay", () => {
    render(subject());

    expect(screen.queryByRole("dialog")).toBeNull();

    hoverTrigger();
    expect(screen.getByRole("dialog", { name: "Status" })).toBeTruthy();

    leave(screen.getByText("trigger"));
    settle(CLOSE_DELAY_MS);

    expect(screen.queryByRole("dialog")).toBeNull();
  });

  // The point of the component: the pointer has to be able to cross the gap
  // into the card to reach the links and buttons the card holds.
  it("stays open when the pointer moves into the card", () => {
    render(subject());

    hoverTrigger();
    const card = screen.getByRole("dialog");

    leave(screen.getByText("trigger"));
    fireEvent.mouseOver(card);
    settle(CLOSE_DELAY_MS);

    expect(screen.getByRole("dialog")).toBeTruthy();

    leave(card);
    settle(CLOSE_DELAY_MS);

    expect(screen.queryByRole("dialog")).toBeNull();
  });
});
