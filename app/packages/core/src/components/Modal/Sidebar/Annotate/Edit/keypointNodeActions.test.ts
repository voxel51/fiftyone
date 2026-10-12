import { describe, expect, it } from "vitest";
import { nodeRowAction } from "./keypointNodeActions";

describe("nodeRowAction", () => {
  it("clears a placed node, armed or not", () => {
    expect(nodeRowAction("placed", true)).toBe("clear");
    expect(nodeRowAction("placed", false)).toBe("clear");
  });

  it("skips the target while placement is armed", () => {
    // the canvas click IS the placement, so Skip is the only useful button
    expect(nodeRowAction("target", true)).toBe("skip");
  });

  it("places the target while placement is unarmed", () => {
    // existing labels open passively — Skip alone would be a dead end
    expect(nodeRowAction("target", false)).toBe("place");
  });

  it("places a skipped node, armed or not", () => {
    expect(nodeRowAction("skipped", true)).toBe("place");
    expect(nodeRowAction("skipped", false)).toBe("place");
  });

  it("places a pending node, armed or not", () => {
    expect(nodeRowAction("pending", true)).toBe("place");
    expect(nodeRowAction("pending", false)).toBe("place");
  });
});
