import { createStore } from "jotai";
import { describe, expect, it, vi } from "vitest";
import { currentTimeAtom, streamValueAtom } from "./atoms";
import { PlaybackStreamBase } from "./stream-base";
import type { BufferReadiness } from "./types";

/**
 * Test subclass — captures `getValue` calls and lets each test control
 * the value to publish. The base wires `onCommit` to write that into
 * `streamValueAtom(id)`, so we can read it back via the store.
 */
class TestStream extends PlaybackStreamBase<string> {
  public values = new Map<number, string>();
  public bufferStateCalls: number[] = [];
  public prefetchCalls: Array<[number, number]> = [];
  public bufferReady: BufferReadiness = "ready";

  bufferState(time: number): BufferReadiness {
    this.bufferStateCalls.push(time);
    return this.bufferReady;
  }

  prefetch(range: [number, number]): void {
    this.prefetchCalls.push(range);
  }

  getValue(time: number): string | null {
    return this.values.get(time) ?? null;
  }
}

describe("PlaybackStreamBase", () => {
  describe("defaults", () => {
    it("blocks by default", () => {
      const s = new TestStream("a");
      expect(s.blocking).toBe(true);
    });

    it("uses a 3-second default lookahead", () => {
      const s = new TestStream("a");
      expect(s.lookaheadSeconds).toBe(3);
    });

    it("uses 'nearest' lookup with a 0.1s threshold by default", () => {
      const s = new TestStream("a");
      expect(s.lookupPolicy).toEqual({
        type: "nearest",
        thresholdSeconds: 0.1,
      });
    });

    it("leaves duration undefined when not provided", () => {
      const s = new TestStream("a");
      expect(s.duration).toBeUndefined();
    });
  });

  describe("option overrides", () => {
    it("respects `blocking: false`", () => {
      const s = new TestStream("a", { blocking: false });
      expect(s.blocking).toBe(false);
    });

    it("respects an explicit duration", () => {
      const s = new TestStream("a", { duration: 12.5 });
      expect(s.duration).toBe(12.5);
    });

    it("respects an explicit lookaheadSeconds", () => {
      const s = new TestStream("a", { lookaheadSeconds: 7 });
      expect(s.lookaheadSeconds).toBe(7);
    });

    it("respects an explicit lookupPolicy", () => {
      const policy = {
        type: "nearestPrevious" as const,
        thresholdSeconds: 0.25,
      };
      const s = new TestStream("a", { lookupPolicy: policy });
      expect(s.lookupPolicy).toEqual(policy);
    });
  });

  describe("identity", () => {
    it("exposes the id passed to the constructor", () => {
      const s = new TestStream("camera_front");
      expect(s.id).toBe("camera_front");
    });
  });

  describe("onCommit", () => {
    it("writes getValue(time) into streamValueAtom(id)", () => {
      const store = createStore();
      const s = new TestStream("camera");
      s.values.set(1, "frame-at-1");

      s.onCommit(1, store);

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      expect(store.get(streamValueAtom("camera"))).toBe("frame-at-1");
    });

    it("publishes null when getValue returns null", () => {
      const store = createStore();
      const s = new TestStream("camera");

      s.onCommit(1, store);

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      expect(store.get(streamValueAtom("camera"))).toBeNull();
    });

    it("scopes published values per stream id", () => {
      const store = createStore();
      const cam = new TestStream("cam");
      const lidar = new TestStream("lidar");
      cam.values.set(0, "cam-0");
      lidar.values.set(0, "lidar-0");

      cam.onCommit(0, store);
      lidar.onCommit(0, store);

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      expect(store.get(streamValueAtom("cam"))).toBe("cam-0");
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      expect(store.get(streamValueAtom("lidar"))).toBe("lidar-0");
    });

    it("invokes getValue exactly once per commit", () => {
      const store = createStore();
      const s = new TestStream("a");
      const spy = vi.spyOn(s, "getValue");

      s.onCommit(0.5, store);

      expect(spy).toHaveBeenCalledTimes(1);
      expect(spy).toHaveBeenCalledWith(0.5);
    });
  });

  describe("bufferedRanges", () => {
    it("defaults to an empty array (no buffered ranges)", () => {
      const s = new TestStream("a");
      expect(s.bufferedRanges()).toEqual([]);
    });
  });
});

/**
 * The protected atom accessors subclasses use instead of touching the jotai
 * atoms directly (the encapsulation seam — keeps `streamValueAtom` /
 * `currentTimeAtom` internal to the lib). Exercised through a subclass that
 * exposes them, mirroring how real streams read engine state.
 */
describe("PlaybackStreamBase atom accessors", () => {
  class ProbeStream extends PlaybackStreamBase<string> {
    getValue(): string | null {
      return null;
    }
    bufferState(): BufferReadiness {
      return "ready";
    }
    prefetch(): void {}
    readBack(store: ReturnType<typeof createStore>) {
      return this.readPublished(store);
    }
    push(store: ReturnType<typeof createStore>, value: string | null) {
      this.publish(store, value);
    }
    now(store: ReturnType<typeof createStore>) {
      return this.readCurrentTime(store);
    }
  }

  describe("readPublished", () => {
    it("returns null before anything is published", () => {
      const store = createStore();
      expect(new ProbeStream("a").readBack(store)).toBeNull();
    });

    it("round-trips the value written by publish", () => {
      const store = createStore();
      const s = new ProbeStream("a");

      s.push(store, "frame-data");

      expect(s.readBack(store)).toBe("frame-data");
      // And it's the same value onCommit would have published.
      expect(store.get(streamValueAtom("a"))).toBe("frame-data");
    });

    it("is scoped per stream id", () => {
      const store = createStore();
      const cam = new ProbeStream("cam");
      const lidar = new ProbeStream("lidar");

      cam.push(store, "cam-frame");

      expect(cam.readBack(store)).toBe("cam-frame");
      expect(lidar.readBack(store)).toBeNull();
    });
  });

  describe("readCurrentTime", () => {
    it("reads the engine's authoritative data-time from the store", () => {
      const store = createStore();
      const s = new ProbeStream("a");

      expect(s.now(store)).toBe(0);
      store.set(currentTimeAtom, 3.5);
      expect(s.now(store)).toBe(3.5);
    });
  });
});
