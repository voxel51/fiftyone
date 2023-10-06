import { setFetchParameters } from "@fiftyone/utilities";
import { describe, expect, it } from "vitest";
import { getSampleSrc } from "./utils";

describe("getSampleSrc tests", () => {
  it("includes proxy in pathname", () => {
    const image = "/path/to/image.png";
    const proxy = "/proxy/test";
    setFetchParameters(window.location.origin, {}, proxy);
    expect(getSampleSrc("/path/to/image.png")).toEqual(
      `${window.location.origin}${proxy}/media?filepath=${encodeURIComponent(
        image
      )}`
    );
  });
});
