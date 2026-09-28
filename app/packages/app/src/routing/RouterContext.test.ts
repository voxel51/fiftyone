import type { Environment } from "relay-runtime";
import { afterEach, describe, expect, it } from "vitest";
import { createRouter } from "./RouterContext";

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
