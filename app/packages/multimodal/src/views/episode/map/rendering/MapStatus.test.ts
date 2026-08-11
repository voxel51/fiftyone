import { describe, expect, it } from "vitest";

import { mapStatusText } from "./MapStatus";

describe("mapStatusText", () => {
  it("distinguishes incomplete history from actual render decimation", () => {
    const state = {
      enabledStreamCount: 1,
      errorCount: 0,
      locationStreamCount: 1,
      readyTrackCount: 1,
    };

    expect(
      mapStatusText({ ...state, downsampled: false, truncated: true }),
    ).toBe("partial route");
    expect(
      mapStatusText({ ...state, downsampled: true, truncated: false }),
    ).toBe("downsampled");
  });
});
