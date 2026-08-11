import { describe, expect, it } from "vitest";

import { fittedImageSize } from "./image-fit";

describe("fittedImageSize", () => {
  it("fits narrower content in both modes", () => {
    const container = { height: 400, width: 300 };
    const content = { height: 200, width: 100 };

    expect(fittedImageSize(container, content, "contain")).toEqual({
      height: 400,
      width: 200,
    });
    expect(fittedImageSize(container, content, "cover")).toEqual({
      height: 600,
      width: 300,
    });
  });

  it("letterboxes contain mode along the shorter axis", () => {
    expect(
      fittedImageSize(
        { height: 300, width: 400 },
        { height: 100, width: 200 },
        "contain",
      ),
    ).toEqual({ height: 200, width: 400 });
  });

  it("crops cover mode along the longer axis", () => {
    expect(
      fittedImageSize(
        { height: 300, width: 400 },
        { height: 100, width: 200 },
        "cover",
      ),
    ).toEqual({ height: 300, width: 600 });
  });
});
