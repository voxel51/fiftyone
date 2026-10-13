import { act, cleanup, renderHook } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it } from "vitest";
import {
  FramePresentationProvider,
  useFramePresentation,
  useHasPresentedFrame,
  useFrameUnavailable,
  useUnavailableFrameTiles,
} from "./FramePresentation";

afterEach(cleanup);

describe("destination frame presentation", () => {
  it("resets presentation for episodes sharing a byte source", () => {
    let episode = "a";
    const { result, rerender } = renderHook(
      () => ({
        rendered: useFramePresentation("shared", true),
        presented: useHasPresentedFrame(),
      }),
      {
        wrapper: ({ children }: { children: ReactNode }) => (
          <FramePresentationProvider
            sourceKey="shared"
            presentationKey={episode}
          >
            {children}
          </FramePresentationProvider>
        ),
      },
    );
    const outgoing = result.current.rendered;
    act(() => outgoing?.());
    expect(result.current.presented).toBe(true);
    episode = "b";
    rerender();
    expect(result.current.presented).toBe(false);
    act(() => outgoing?.());
    expect(result.current.presented).toBe(false);
    episode = "a";
    rerender();
    expect(result.current.presented).toBe(false);
    // A late frame from the first visit to A cannot present the second visit.
    act(() => outgoing?.());
    expect(result.current.presented).toBe(false);
    act(() => result.current.rendered?.());
    expect(result.current.presented).toBe(true);
    // Nor can that old callback undo a frame from the current visit.
    act(() => outgoing?.());
    expect(result.current.presented).toBe(true);
  });
  it("reveals terminal panes without reporting a media frame and rejects outgoing errors", () => {
    let destination = "a";
    const { result, rerender } = renderHook(
      ({ source, unavailable }) => {
        useFrameUnavailable(source, "camera", unavailable);
        return {
          tiles: useUnavailableFrameTiles(),
          presented: useHasPresentedFrame(),
        };
      },
      {
        initialProps: { source: "a", unavailable: true },
        wrapper: ({ children }: { children: ReactNode }) => (
          <FramePresentationProvider sourceKey={destination}>
            {children}
          </FramePresentationProvider>
        ),
      },
    );
    expect(result.current.tiles.has("camera")).toBe(true);
    expect(result.current.presented).toBe(false);
    destination = "b";
    rerender({ source: "a", unavailable: true });
    expect(result.current.tiles.size).toBe(0);
    rerender({ source: "b", unavailable: true });
    expect(result.current.tiles.has("camera")).toBe(true);
    rerender({ source: "b", unavailable: false });
    expect(result.current.tiles.size).toBe(0);
  });
  it("keeps the preview for empty and outgoing frames, then resets on navigation", () => {
    let destination = "a";
    const { result, rerender } = renderHook(
      ({ source, content }) => ({
        presented: useHasPresentedFrame(),
        rendered: useFramePresentation(source, content),
      }),
      {
        initialProps: { source: "a", content: false },
        wrapper: ({ children }: { children: ReactNode }) => (
          <FramePresentationProvider sourceKey={destination}>
            {children}
          </FramePresentationProvider>
        ),
      },
    );
    expect(result.current.presented).toBe(false);
    expect(result.current.rendered).toBeUndefined();
    rerender({ source: "a", content: true });
    act(() => result.current.rendered?.());
    expect(result.current.presented).toBe(true);
    destination = "b";
    rerender({ source: "a", content: true });
    expect(result.current.presented).toBe(false);
    act(() => result.current.rendered?.());
    expect(result.current.presented).toBe(false);
    rerender({ source: "b", content: true });
    act(() => result.current.rendered?.());
    expect(result.current.presented).toBe(true);
  });
});
