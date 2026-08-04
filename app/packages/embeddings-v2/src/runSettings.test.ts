// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { readRunSettings, writeRunSettings } from "./runSettings";

const KEY = "fiftyone.embeddings-v2.runSettings.v1";

/** A localStorage that fails every write, as a private window or a full quota
 * does. Settings are a convenience; losing them must never reach the user. */
function hostileStorage() {
  return {
    getItem: () => {
      throw new DOMException("denied", "SecurityError");
    },
    setItem: () => {
      throw new DOMException("quota", "QuotaExceededError");
    },
    removeItem: vi.fn(),
    clear: vi.fn(),
    key: vi.fn(),
    length: 0,
  } as unknown as Storage;
}

describe("run settings storage", () => {
  beforeEach(() => {
    window.localStorage.clear();
    vi.restoreAllMocks();
  });

  it("gives a run back the settings it was last read with", () => {
    writeRunSettings("ds", "viz", { rampId: "viridis" });
    writeRunSettings("ds", "viz", {
      similarLimit: { mode: "distance", value: 0.3, cap: 900 },
    });

    // Merged, not replaced: each control writes only its own key
    expect(readRunSettings("ds", "viz")).toEqual({
      rampId: "viridis",
      similarLimit: { mode: "distance", value: 0.3, cap: 900 },
    });
  });

  it("keeps runs and datasets apart", () => {
    writeRunSettings("ds", "viz", { rampId: "viridis" });

    // A palette chosen for one run's field says nothing about another's
    expect(readRunSettings("ds", "other")).toEqual({});
    expect(readRunSettings("other", "viz")).toEqual({});
  });

  it("reads nothing for an unidentified run", () => {
    writeRunSettings(null, "viz", { rampId: "viridis" });
    expect(readRunSettings(null, "viz")).toEqual({});
    expect(readRunSettings("ds", null)).toEqual({});
    // Nothing was stored under a placeholder key either
    expect(window.localStorage.getItem(KEY)).toBeNull();
  });

  it("survives contents it did not write", () => {
    window.localStorage.setItem(KEY, "{not json");
    expect(readRunSettings("ds", "viz")).toEqual({});

    window.localStorage.setItem(KEY, JSON.stringify(["wrong", "shape"]));
    expect(readRunSettings("ds", "viz")).toEqual({});

    // And a write over garbage still lands
    writeRunSettings("ds", "viz", { rampId: "viridis" });
    expect(readRunSettings("ds", "viz")).toEqual({ rampId: "viridis" });
  });

  it("never throws when storage refuses", () => {
    vi.spyOn(window, "localStorage", "get").mockReturnValue(hostileStorage());

    expect(() =>
      writeRunSettings("ds", "viz", { rampId: "viridis" }),
    ).not.toThrow();
    expect(readRunSettings("ds", "viz")).toEqual({});
  });

  it("forgets the least recently set run past its cap", () => {
    // 33 runs against a cap of 32
    for (let i = 0; i < 33; i++) {
      writeRunSettings("ds", `viz${i}`, { rampId: "viridis" });
    }

    expect(readRunSettings("ds", "viz0")).toEqual({});
    expect(readRunSettings("ds", "viz32")).toEqual({ rampId: "viridis" });
  });

  it("keeps a run that is still being changed", () => {
    writeRunSettings("ds", "keep", { rampId: "viridis" });
    for (let i = 0; i < 31; i++) {
      writeRunSettings("ds", `viz${i}`, { rampId: "coolWarm" });
    }
    // Re-set at the end: an in-use run must not be evicted by its first-write
    // position, which is what a plain re-assignment would have left it with
    writeRunSettings("ds", "keep", { rampId: "blueOrange" });
    writeRunSettings("ds", "one-too-many", { rampId: "viridis" });

    expect(readRunSettings("ds", "keep")).toEqual({ rampId: "blueOrange" });
    expect(readRunSettings("ds", "viz0")).toEqual({});
  });
});

