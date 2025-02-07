import { SESSION_DEFAULT } from "@fiftyone/state";
import { describe, expect, it } from "vitest";
import { assignSession } from "./onSetDataset";

describe("test session assignment for dataset transition", () => {
  it("assigns color scheme settings", () => {
    const session = { ...SESSION_DEFAULT };

    assignSession(session, { colorScheme: { colorPool: ["#ffffff"] } });
    expect(session.colorScheme.colorPool).toEqual(["#ffffff"]);
  });
});
