/**
 * Copyright 2017-2026, Voxel51, Inc.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DecodeSession } from "./decodeSession";

/**
 * A stand-in `VideoDecoder` that holds every decoded chunk until `flush()`,
 * the way a hardware decoder holds a pipeline of finished frames.
 */
class FakeDecoder {
  static instances: FakeDecoder[] = [];
  state: "unconfigured" | "configured" | "closed" = "unconfigured";
  configureCalls = 0;
  flushCalls = 0;
  private held: unknown[] = [];

  constructor(private readonly init: VideoDecoderInit) {
    FakeDecoder.instances.push(this);
  }

  configure() {
    this.configureCalls += 1;
    this.state = "configured";
  }

  decode(chunk: unknown) {
    this.held.push(chunk);
  }

  async flush() {
    this.flushCalls += 1;
    for (const chunk of this.held.splice(0)) {
      this.init.output(chunk as VideoFrame);
    }
  }

  fail(message: string) {
    this.state = "closed";
    this.init.error(new DOMException(message, "EncodingError"));
  }
}

const CONFIG = { codec: "vp09.00.10.08" } as VideoDecoderConfig;
const chunk = (timestamp: number) => ({ timestamp }) as EncodedVideoChunk;

beforeEach(() => {
  FakeDecoder.instances = [];
  vi.stubGlobal("VideoDecoder", FakeDecoder);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("DecodeSession", () => {
  it("continues only from the sample right after the last one fed", () => {
    const session = new DecodeSession(
      () => undefined,
      () => undefined,
    );
    session.restart(CONFIG);
    session.decode(chunk(0), 0);
    session.decode(chunk(1), 1);

    expect(session.canContinue(2)).toBe(true);
    expect(session.canContinue(3)).toBe(false);
    expect(session.canContinue(1)).toBe(false);
  });

  it("does not flush to hand a chunk over", () => {
    const session = new DecodeSession(
      () => undefined,
      () => undefined,
    );
    session.restart(CONFIG);
    session.decode(chunk(0), 0);

    expect(FakeDecoder.instances[0].flushCalls).toBe(0);
    expect(session.canContinue(1)).toBe(true);
  });

  it("flushing emits held frames and ends continuity", async () => {
    const frames: number[] = [];
    const session = new DecodeSession(
      (f) => frames.push(f.timestamp),
      () => undefined,
    );
    session.restart(CONFIG);
    session.decode(chunk(0), 0);
    session.decode(chunk(1), 1);

    await session.flush();

    expect(frames).toEqual([0, 1]);
    expect(session.canContinue(2)).toBe(false);
  });

  it("flushing an unconfigured decoder is a no-op", async () => {
    const session = new DecodeSession(
      () => undefined,
      () => undefined,
    );

    await expect(session.flush()).resolves.toBeUndefined();
    expect(FakeDecoder.instances[0].flushCalls).toBe(0);
  });

  it("reports a decoder failure and ends continuity", () => {
    const onError = vi.fn();
    const session = new DecodeSession(() => undefined, onError);
    session.restart(CONFIG);
    session.decode(chunk(0), 0);

    FakeDecoder.instances[0].fail("Decoding error.");

    expect(onError).toHaveBeenCalledTimes(1);
    expect(session.canContinue(1)).toBe(false);
  });

  it("recreates a closed decoder on restart", () => {
    const session = new DecodeSession(
      () => undefined,
      () => undefined,
    );
    session.restart(CONFIG);
    FakeDecoder.instances[0].fail("Decoding error.");

    session.restart(CONFIG);

    expect(FakeDecoder.instances).toHaveLength(2);
    expect(FakeDecoder.instances[1].configureCalls).toBe(1);
  });
});
