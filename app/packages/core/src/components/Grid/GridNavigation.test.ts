import type { PaginateSamplesNode } from "@fiftyone/relay";
import { describe, expect, it } from "vitest";
import { GridNavigation } from "./GridNavigation";

const node = (id: string): PaginateSamplesNode => ({
  __typename: "ImageSample",
  id,
  sample: { _id: id },
  urls: [],
  aspectRatio: 1,
});
const seek = (id: string) => ({
  kind: "seek" as const,
  nodes: [node(id)],
  previous: { sampleId: id, direction: "before" as const },
  next: { sampleId: id, direction: "after" as const },
});

describe("bounded navigation state", () => {
  it("seeds the destination once and supplies identity cursors in both directions", () => {
    const navigation = new GridNavigation();
    const page = seek("target");
    navigation.start(0, page.nodes, page);
    expect(navigation.takeSeed(0)?.nodes).toEqual(page.nodes);
    expect(navigation.takeSeed(0)).toBeUndefined();
    expect(navigation.cursor(-1)).toEqual({
      sampleId: "target",
      direction: "before",
    });
    expect(navigation.cursor(1)).toEqual({
      sampleId: "target",
      direction: "after",
    });
    expect(navigation.cursor(0)).toEqual({
      sampleId: "target",
      direction: "at",
    });
  });

  it("preserves the before cursor for a partial first page when reloading", () => {
    const navigation = new GridNavigation();
    navigation.start(0, seek("target").nodes, seek("target"));
    expect(
      navigation.remember(-1, { ...seek("first"), previous: null }),
    ).toEqual({ previous: null, next: 0 });
    expect(navigation.cursor(-1)).toEqual({
      sampleId: "target",
      direction: "before",
    });
    expect(navigation.cursor(0)).toEqual({
      sampleId: "target",
      direction: "at",
    });
  });

  it("forgets old bookmarks and retires a cursor window on an offset fallback", () => {
    const navigation = new GridNavigation();
    navigation.start(0, seek("target").nodes, seek("target"));
    for (let i = 1; i < 1000; i++) navigation.remember(i, seek(String(i)));
    expect(navigation.cursor(0)).toBeUndefined();
    expect(navigation.cursor(1000)).toBeDefined();
    navigation.start(42, [node("offset")], undefined, true);
    expect(navigation.active).toBe(false);
    expect(navigation.takeSeed(42)).toEqual({
      nodes: [node("offset")],
      previous: 41,
      next: 43,
    });
    expect(navigation.cursor(1000)).toBeUndefined();
  });

  it("keeps recently used bookmarks while bounding a long browse", () => {
    const navigation = new GridNavigation();
    navigation.start(0, seek("target").nodes, seek("target"));
    for (let i = 1; i < 1000; i++) {
      navigation.cursor(0);
      navigation.remember(i, seek(String(i)));
    }
    expect(navigation.cursor(0)?.sampleId).toBe("target");
    expect(navigation.cursor(1)).toBeUndefined();
    navigation.reset();
    expect(navigation.active).toBe(false);
    expect(navigation.takeSeed(0)).toBeUndefined();
    expect(navigation.cursor(0)).toBeUndefined();
  });
});
