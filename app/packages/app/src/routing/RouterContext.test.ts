import { Action } from "history";
import type { Environment } from "relay-runtime";
import { afterEach, describe, expect, it } from "vitest";
import { createRouter, isParamMove, LOCATION_WRITE } from "./RouterContext";

afterEach(() => window.history.replaceState({}, "", "/"));

describe("current URL search parameters", () => {
  it("includes shared UI query changes before a modal or view builds its URL", () => {
    window.history.replaceState({}, "", "/datasets/one");
    // No routes are loaded in this test, so the Relay environment is unused.
    const router = createRouter({} as Environment, []);
    window.history.replaceState(
      window.history.state,
      "",
      "?subset=one&id=sample",
    );
    expect(router.context.location.search).toBe("?subset=one&id=sample");
    window.history.replaceState(window.history.state, "", "?id=sample");
    expect(router.context.location.search).toBe("?id=sample");
    router.cleanup();
  });

  it("does not mix an outgoing route with the next dataset's query", () => {
    window.history.replaceState({}, "", "/datasets/one?subset=one");
    const router = createRouter({} as Environment, []);
    window.history.replaceState(
      window.history.state,
      "",
      "/datasets/two?subset=two",
    );
    expect(router.context.location.pathname).toBe("/datasets/one");
    expect(router.context.location.search).toBe("?subset=one");
    router.cleanup();
  });
});

describe("param moves", () => {
  const marked = { view: [], [LOCATION_WRITE]: true };
  const at = (pathname: string, state: unknown) => ({ pathname, state });

  it("keeps the entry for a marked write on the same path", () => {
    expect(
      isParamMove(
        at("/datasets/a", marked),
        at("/datasets/a", {}),
        Action.Push,
      ),
    ).toBe(true);
  });

  it("routes a write on another path, and any unmarked write", () => {
    expect(
      isParamMove(
        at("/datasets/a", marked),
        at("/datasets/b", {}),
        Action.Push,
      ),
    ).toBe(false);
    expect(
      isParamMove(
        at("/datasets/a", { view: [] }),
        at("/datasets/a", marked),
        Action.Push,
      ),
    ).toBe(false);
    expect(
      isParamMove(
        at("/datasets/a", null),
        at("/datasets/a", {}),
        Action.Replace,
      ),
    ).toBe(false);
  });

  it("keeps the page when a sample opens or closes on its path", () => {
    expect(
      isParamMove(
        at("/datasets/a/samples/s", marked),
        at("/datasets/a", {}),
        Action.Push,
      ),
    ).toBe(true);
    expect(
      isParamMove(
        at("/datasets/a", { view: [] }),
        at("/datasets/a/groups/g", marked),
        Action.Pop,
      ),
    ).toBe(true);
    expect(
      isParamMove(
        at("/datasets/b/samples/s", marked),
        at("/datasets/a", {}),
        Action.Push,
      ),
    ).toBe(false);
  });

  it("keeps the entry on Back from a marked entry to its grid", () => {
    expect(
      isParamMove(
        at("/datasets/a", { view: [] }),
        at("/datasets/a", marked),
        Action.Pop,
      ),
    ).toBe(true);
  });

  it("routes a pop that changes the view", () => {
    const stage = { _cls: "fiftyone.core.stages.Limit", kwargs: [] };
    expect(
      isParamMove(
        at("/datasets/a", { ...marked, view: [stage] }),
        at("/datasets/a", { view: [] }),
        Action.Pop,
      ),
    ).toBe(false);
  });

  it("routes a pop between entries the router made", () => {
    expect(
      isParamMove(
        at("/datasets/a", { view: [] }),
        at("/datasets/a", { view: [] }),
        Action.Pop,
      ),
    ).toBe(false);
  });
});
