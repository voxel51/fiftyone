/**
 * Copyright 2017-2026, Voxel51, Inc.
 */

import { describe, expect, it } from "vitest";
import {
  type DecodeCapabilities,
  type DecodeStrategy,
  parseForcedStrategy,
  resolveDecodeStrategy,
} from "./decodeStrategy";

const caps = (over: Partial<DecodeCapabilities> = {}): DecodeCapabilities => ({
  hasVideoSrc: false,
  nativeDecodable: false,
  hasFrames: false,
  ...over,
});

describe("resolveDecodeStrategy", () => {
  it("extracts when the source video is natively decodable", () => {
    expect(
      resolveDecodeStrategy(caps({ hasVideoSrc: true, nativeDecodable: true })),
    ).toBe("extract");
  });

  it("prefers extract over fetch when both are possible", () => {
    expect(
      resolveDecodeStrategy(
        caps({ hasVideoSrc: true, nativeDecodable: true, hasFrames: true }),
      ),
    ).toBe("extract");
  });

  it("fetches materialized frames when not natively decodable", () => {
    expect(
      resolveDecodeStrategy(caps({ hasVideoSrc: true, hasFrames: true })),
    ).toBe("fetch");
  });

  it("fetches when frames exist but there is no source video URL", () => {
    expect(resolveDecodeStrategy(caps({ hasFrames: true }))).toBe("fetch");
  });

  it("falls back to the html tile when neither extract nor fetch is possible", () => {
    expect(resolveDecodeStrategy(caps({ hasVideoSrc: true }))).toBe("html");
  });

  it("falls back to html even with no usable media (degenerate case)", () => {
    expect(resolveDecodeStrategy(caps())).toBe("html");
  });

  it("does not extract when decodable but the source URL is missing", () => {
    // nativeDecodable can't truly be set without a src, but the guard keeps
    // the policy honest against an inconsistent snapshot.
    expect(resolveDecodeStrategy(caps({ nativeDecodable: true }))).toBe("html");
  });

  describe("forced override", () => {
    const strategies: DecodeStrategy[] = ["extract", "fetch", "html"];

    for (const forced of strategies) {
      it(`honors forced="${forced}" regardless of capabilities`, () => {
        expect(
          resolveDecodeStrategy(
            caps({
              forced,
              // Capabilities that would otherwise resolve differently.
              hasVideoSrc: true,
              nativeDecodable: forced !== "extract",
              hasFrames: forced === "html",
            }),
          ),
        ).toBe(forced);
      });
    }
  });
});

describe("parseForcedStrategy", () => {
  it("returns undefined when nothing forces", () => {
    expect(parseForcedStrategy("")).toBeUndefined();
    expect(parseForcedStrategy("?foo=bar")).toBeUndefined();
    expect(parseForcedStrategy("?tile=imavid")).toBeUndefined();
  });

  it("honors the canonical video-decode param", () => {
    expect(parseForcedStrategy("?video-decode=extract")).toBe("extract");
    expect(parseForcedStrategy("?video-decode=fetch")).toBe("fetch");
    expect(parseForcedStrategy("?video-decode=html")).toBe("html");
  });

  it("ignores an unknown canonical value", () => {
    expect(parseForcedStrategy("?video-decode=bogus")).toBeUndefined();
  });

  it("maps the legacy decode param", () => {
    expect(parseForcedStrategy("?decode=native")).toBe("extract");
    expect(parseForcedStrategy("?decode=frames")).toBe("fetch");
  });

  it("maps the legacy tile=video param", () => {
    expect(parseForcedStrategy("?tile=video")).toBe("html");
  });

  it("prefers the canonical param over legacy params", () => {
    expect(parseForcedStrategy("?video-decode=html&decode=native")).toBe(
      "html",
    );
  });
});
