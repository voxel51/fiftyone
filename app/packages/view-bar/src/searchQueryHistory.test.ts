import { describe, expect, it } from "vitest";
import { QUERY_HISTORY_CAP, rememberQuery } from "./searchQueryHistory";

describe("rememberQuery", () => {
  it("puts the newest query first", () => {
    expect(rememberQuery(["dog"], "cat")).toEqual(["cat", "dog"]);
  });

  it("moves a repeated query to the front instead of duplicating it", () => {
    expect(rememberQuery(["dog", "cat", "bird"], "cat")).toEqual([
      "cat",
      "dog",
      "bird",
    ]);
  });

  it("caps the list", () => {
    const full = Array.from({ length: QUERY_HISTORY_CAP }, (_, i) => `q${i}`);
    const next = rememberQuery(full, "new");
    expect(next).toHaveLength(QUERY_HISTORY_CAP);
    expect(next[0]).toBe("new");
    expect(next).not.toContain(`q${QUERY_HISTORY_CAP - 1}`);
  });
});
