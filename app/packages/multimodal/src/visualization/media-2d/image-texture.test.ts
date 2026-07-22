import { describe, expect, it } from "vitest";

import type { RawImageVisualization } from "../../ir";
import { VISUALIZATION_KIND } from "../visualization-registry";
import { createImageTexture } from "./image-texture";

describe("createImageTexture", () => {
  it("rejects truncated raw RGBA frames before GPU upload", async () => {
    await expect(
      createImageTexture(rawFrame([255, 0, 0, 255])),
    ).rejects.toThrow("Raw image frame has too few RGBA bytes");
  });
});

function rawFrame(rgba: readonly number[]): RawImageVisualization {
  return {
    height: 1,
    kind: VISUALIZATION_KIND.RAW_IMAGE,
    rgba: new Uint8Array(rgba),
    sourceEncoding: "rgb8",
    width: 2,
  };
}
