import { setFetchParameters } from "@fiftyone/utilities";
import { describe, expect, it } from "vitest";
import { getSampleSrc, withoutPaths } from "./utils";

describe("getSampleSrc tests", () => {
  it("includes proxy in pathname", () => {
    const image = "/path/to/image.png";
    const proxy = "/proxy/test";
    setFetchParameters(window.location.origin, {}, proxy);
    expect(getSampleSrc("/path/to/image.png")).toEqual(
      `${window.location.origin}${proxy}/media?filepath=${encodeURIComponent(
        image,
      )}`,
    );
  });
});

describe("withoutPaths", () => {
  const sample = {
    _id: "s1",
    clip: { label: "cat" },
    gt: {
      detections: [
        { label: "a", year: 1999 },
        { label: "b", year: 2001 },
      ],
    },
    urls: { filepath: "/a.png" },
  };

  it("removes top-level fields and attributes inside lists", () => {
    expect(withoutPaths(sample, ["clip", "gt.detections.year"])).toEqual({
      _id: "s1",
      gt: { detections: [{ label: "a" }, { label: "b" }] },
      urls: { filepath: "/a.png" },
    });
  });

  it("copies only what it changes", () => {
    const pruned = withoutPaths(sample, ["gt.detections.year"]);

    expect(pruned).not.toBe(sample);
    expect(pruned.urls).toBe(sample.urls);
    expect(sample.gt.detections[0].year).toBe(1999);
  });

  it("returns the value itself when nothing is removed", () => {
    expect(withoutPaths(sample, [])).toBe(sample);
    expect(withoutPaths(sample, ["missing", "gt.missing.year"])).toBe(sample);
  });

  it("removes a field whole when a path and its descendant are both given", () => {
    for (const paths of [
      ["gt", "gt.detections.year"],
      ["gt.detections.year", "gt"],
    ]) {
      expect(withoutPaths(sample, paths)).not.toHaveProperty("gt");
    }
  });
});
