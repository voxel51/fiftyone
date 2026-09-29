/**
 * Copyright 2017-2026, Voxel51, Inc.
 */

import { ensureColorScheme, type Session } from "@fiftyone/state";
import { describe, expect, it, vi } from "vitest";

const unsubscribe = vi.fn();
vi.mock("@fiftyone/relay", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@fiftyone/relay")>()),
  subscribeBefore: () => unsubscribe,
}));

const { processState } = await import("./utils");

const COLOR_SCHEME = {
  color_pool: ["#ff0000", "#00ff00"],
  color_by: "value",
  fields: [],
};

describe("processState", () => {
  it("stages the server's color scheme when the first page is loaded", () => {
    const session = {} as Session;
    const { stage } = processState(session, {
      color_scheme: COLOR_SCHEME,
      view: [],
    });

    // the first page is loaded rather than published, so the caller stages it
    stage({
      data: { dataset: { defaultGroupSlice: "left" } },
    } as Parameters<typeof stage>[0]);

    expect(session.colorScheme).toEqual(ensureColorScheme(COLOR_SCHEME));
    expect(session.sessionGroupSlice).toBe("left");
    expect(unsubscribe).toHaveBeenCalledTimes(1);
  });
});
