/**
 * Copyright 2017-2026, Voxel51, Inc.
 */

import { describe, expect, it } from "vitest";
import { parseFrameCacheDebug } from "./frameCacheDebug";

describe("parseFrameCacheDebug", () => {
  it("returns empty overrides for no params", () => {
    expect(parseFrameCacheDebug("")).toEqual({});
    expect(parseFrameCacheDebug("?foo=bar")).toEqual({});
  });

  it("parses a positive byte budget", () => {
    expect(parseFrameCacheDebug("?frame-cache-bytes=8000000")).toEqual({
      maxBytes: 8000000,
    });
  });

  it("ignores non-positive or non-numeric budgets", () => {
    expect(parseFrameCacheDebug("?frame-cache-bytes=0")).toEqual({});
    expect(parseFrameCacheDebug("?frame-cache-bytes=-5")).toEqual({});
    expect(parseFrameCacheDebug("?frame-cache-bytes=abc")).toEqual({});
  });

  it("parses the unsafe flag only when exactly 1", () => {
    expect(parseFrameCacheDebug("?frame-cache-unsafe=1")).toEqual({
      unsafe: true,
    });
    expect(parseFrameCacheDebug("?frame-cache-unsafe=true")).toEqual({});
    expect(parseFrameCacheDebug("?frame-cache-unsafe=0")).toEqual({});
  });

  it("parses both params together", () => {
    expect(
      parseFrameCacheDebug("?frame-cache-bytes=1234&frame-cache-unsafe=1"),
    ).toEqual({ maxBytes: 1234, unsafe: true });
  });
});
