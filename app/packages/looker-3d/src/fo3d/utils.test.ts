import type { ModalSample } from "@fiftyone/state";
import { describe, expect, it } from "vitest";
import { getMediaPathForFo3dSample } from "./utils";

const buildModalSample = ({
  filepath,
  urls,
}: {
  filepath: string;
  urls?: ModalSample["urls"];
}) =>
  ({
    sample: {
      _id: filepath,
      filepath,
    },
    urls,
  }) as ModalSample;

describe("getMediaPathForFo3dSample", () => {
  it("falls back to the sample filepath when array urls are empty", () => {
    expect(
      getMediaPathForFo3dSample(
        buildModalSample({
          filepath: "/tmp/fallback.fo3d",
          urls: [],
        }),
        "filepath",
      ),
    ).toBe("/tmp/fallback.fo3d");
  });

  it("falls back to the sample filepath when urls are missing", () => {
    expect(
      getMediaPathForFo3dSample(
        buildModalSample({
          filepath: "/tmp/fallback.fo3d",
        }),
        "filepath",
      ),
    ).toBe("/tmp/fallback.fo3d");
  });
});
