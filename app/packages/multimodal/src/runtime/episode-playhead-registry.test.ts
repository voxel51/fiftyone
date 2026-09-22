import { afterEach, describe, expect, it, vi } from "vitest";
import {
  getEpisodePlayhead,
  publishEpisodePlayhead,
  releaseEpisodePlayhead,
  resetEpisodePlayheadsForTests,
  subscribeEpisodePlayhead,
} from "./episode-playhead-registry";

afterEach(() => resetEpisodePlayheadsForTests());

describe("episode playhead registry", () => {
  it("reports null for an episode nothing has published", () => {
    expect(getEpisodePlayhead("absent")).toBeNull();
  });

  it("round-trips a published instant", () => {
    publishEpisodePlayhead("a", 1_700_000_000_000_000_000n);

    expect(getEpisodePlayhead("a")).toBe(1_700_000_000_000_000_000n);
  });

  it("keeps episodes independent", () => {
    publishEpisodePlayhead("a", 1n);
    publishEpisodePlayhead("b", 2n);

    expect(getEpisodePlayhead("a")).toBe(1n);
    expect(getEpisodePlayhead("b")).toBe(2n);
  });

  it("notifies that episode's subscribers on publish", () => {
    const listener = vi.fn();
    subscribeEpisodePlayhead("a", listener);

    publishEpisodePlayhead("a", 5n);

    expect(listener).toHaveBeenCalledTimes(1);
  });

  it("does not notify subscribers of other episodes", () => {
    const listener = vi.fn();
    subscribeEpisodePlayhead("a", listener);

    publishEpisodePlayhead("b", 5n);

    expect(listener).not.toHaveBeenCalled();
  });

  it("skips the notification when the instant is unchanged", () => {
    // A tile presents many frames; re-publishing the same instant must not wake
    // every subscriber, since useSyncExternalStore re-renders on each notice.
    publishEpisodePlayhead("a", 5n);
    const listener = vi.fn();
    subscribeEpisodePlayhead("a", listener);

    publishEpisodePlayhead("a", 5n);

    expect(listener).not.toHaveBeenCalled();
  });

  it("withdraws the playhead on release and notifies", () => {
    publishEpisodePlayhead("a", 5n);
    const listener = vi.fn();
    subscribeEpisodePlayhead("a", listener);

    releaseEpisodePlayhead("a");

    expect(getEpisodePlayhead("a")).toBeNull();
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it("does not notify when releasing something never published", () => {
    const listener = vi.fn();
    subscribeEpisodePlayhead("a", listener);

    releaseEpisodePlayhead("a");

    expect(listener).not.toHaveBeenCalled();
  });

  it("stops notifying an unsubscribed listener", () => {
    const listener = vi.fn();
    const unsubscribe = subscribeEpisodePlayhead("a", listener);

    unsubscribe();
    publishEpisodePlayhead("a", 5n);

    expect(listener).not.toHaveBeenCalled();
  });

  it("leaves other listeners subscribed when one unsubscribes", () => {
    const kept = vi.fn();
    const dropped = vi.fn();
    subscribeEpisodePlayhead("a", kept);
    const unsubscribe = subscribeEpisodePlayhead("a", dropped);

    unsubscribe();
    publishEpisodePlayhead("a", 5n);

    expect(kept).toHaveBeenCalledTimes(1);
    expect(dropped).not.toHaveBeenCalled();
  });

  it("holds instants beyond Number.MAX_SAFE_INTEGER exactly", () => {
    // Absolute epoch nanoseconds are ~1.8e18, two orders of magnitude past
    // what a JS number holds exactly — hence bigint throughout.
    const ns = 1_800_000_000_123_456_789n;
    // Neighbouring instants collapse onto one float, so a number could not tell
    // these apart at all...
    expect(Number(ns)).toBe(Number(ns + 1n));

    // ...while the registry keeps them distinct and exact.
    publishEpisodePlayhead("a", ns);
    expect(getEpisodePlayhead("a")).toBe(ns);
    publishEpisodePlayhead("a", ns + 1n);
    expect(getEpisodePlayhead("a")).toBe(ns + 1n);
  });
});
