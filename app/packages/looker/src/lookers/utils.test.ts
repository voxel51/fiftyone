import { describe, expect, it } from "vitest";
import type { Buffers } from "../state";
import { hasFrame } from "./utils";

describe("looker utilities", () => {
  it("determines frame availability given a buffer list", () => {
    const BUFFERS: Buffers = [
      [1, 3],
      [5, 25],
    ];
    for (const frameNumber of [1, 10, 25]) {
      expect(hasFrame(BUFFERS, frameNumber)).toBe(true);
    }

    for (const frameNumber of [0, 4, 26]) {
      expect(hasFrame(BUFFERS, frameNumber)).toBe(false);
    }
  });
});
