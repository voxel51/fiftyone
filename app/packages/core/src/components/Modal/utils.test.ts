import { describe, expect, it } from "vitest";
import { shortcutToHelpItems } from "./utils";

describe("shortcut processing test", () => {
  it("parses unique shortcuts", () => {
    const results = shortcutToHelpItems({
      one: { shortcut: "test" },
      two: { shortcut: "test" },
    });
    expect(results).toStrictEqual([{ shortcut: "test" }]);
  });
});
