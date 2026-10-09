import { Action } from "history";
import { afterEach, describe, expect, it } from "vitest";
import { isParamMove, LOCATION_WRITE } from "./RouterContext";

afterEach(() => window.history.replaceState({}, "", "/"));

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
        at("/datasets/a/sample/s", marked),
        at("/datasets/a", {}),
        Action.Push,
      ),
    ).toBe(true);
    expect(
      isParamMove(
        at("/datasets/a", { view: [] }),
        at("/datasets/a/group/g", marked),
        Action.Pop,
      ),
    ).toBe(true);
    expect(
      isParamMove(
        at("/datasets/b/sample/s", marked),
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
