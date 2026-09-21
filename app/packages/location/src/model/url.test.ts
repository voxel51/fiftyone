/**
 * Copyright 2017-2026, Voxel51, Inc.
 */

import { describe, expect, it } from "vitest";
import type { RouteCodec } from "./route";
import { formatUrl, parseUrl } from "./url";

type Route =
  | { kind: "root" }
  | { kind: "thing"; id: string }
  | { kind: "other"; path: string };

const codec: RouteCodec<Route> = {
  parse(pathname) {
    const [head, id] = pathname.split("/").filter(Boolean);
    if (!head) return { kind: "root" };
    if (head === "thing" && id) return { kind: "thing", id };
    return { kind: "other", path: pathname };
  },
  format(route) {
    if (route.kind === "root") return "/";
    if (route.kind === "thing") return `/thing/${route.id}`;
    return route.path;
  },
  scopes: (route) => (route.kind === "thing" ? { thing: route.id } : {}),
};

describe("parseUrl", () => {
  it("delegates the path to the codec", () => {
    expect(parseUrl(codec, "/thing/7").route).toEqual({
      kind: "thing",
      id: "7",
    });
  });

  it("makes every query key a param", () => {
    expect(
      parseUrl(codec, "/thing/7?view=v&slice=left&mode=annotate").params,
    ).toEqual({ view: "v", slice: "left", mode: "annotate" });
  });

  it("needs no origin to read a root-relative href", () => {
    expect(parseUrl(codec, "/").route).toEqual({ kind: "root" });
    expect(parseUrl(codec, "/?a=1").params).toEqual({ a: "1" });
  });

  it("drops a fragment rather than folding it into a param", () => {
    expect(parseUrl(codec, "/thing/7?a=1#frag").params).toEqual({ a: "1" });
  });
});

describe("formatUrl", () => {
  it("sorts params so one model is always one string", () => {
    const a = formatUrl(codec, {
      route: { kind: "root" },
      params: { b: "2", a: "1" },
    });
    const b = formatUrl(codec, {
      route: { kind: "root" },
      params: { a: "1", b: "2" },
    });
    expect(a).toBe(b);
    expect(a).toBe("/?a=1&b=2");
  });

  it("omits the query when there are no params", () => {
    expect(
      formatUrl(codec, { route: { kind: "thing", id: "7" }, params: {} }),
    ).toBe("/thing/7");
  });

  it("keeps a param write on a path the codec does not model", () => {
    expect(
      formatUrl(codec, {
        route: { kind: "other", path: "/somewhere/else" },
        params: { a: "1" },
      }),
    ).toBe("/somewhere/else?a=1");
  });
});

describe("round trip", () => {
  it.each([
    "/",
    "/thing/7",
    "/somewhere/else",
    "/thing/7?a=1&b=2",
    "/somewhere/else?a=1",
  ])("survives %s", (href) => {
    expect(formatUrl(codec, parseUrl(codec, href))).toBe(href);
  });
});
