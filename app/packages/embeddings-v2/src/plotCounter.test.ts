import { describe, expect, it } from "vitest";
import { counterLabel } from "./plotCounter";

const RUN = { loaded: 313696, total: 313696, selected: null, inView: null };

describe("counterLabel", () => {
  it("reports the run's size when nothing is selected", () => {
    expect(counterLabel(RUN)).toBe("313,696 points");
  });

  it("pluralizes by the total while loading, by the count once done", () => {
    // Mid-stream the noun names the total ("of 2 points"), not the loaded 1
    expect(
      counterLabel({ loaded: 1, total: 2, selected: null, inView: null }),
    ).toBe("1 / 2 points");
    expect(
      counterLabel({ loaded: 1, total: 1, selected: null, inView: null }),
    ).toBe("1 point");
  });

  it("leads with the selection once there is one", () => {
    // The bug this guards: a selection left the counter reading the run's
    // total, so the number on screen was the one thing the user had NOT asked
    // about
    expect(counterLabel({ ...RUN, selected: 17 })).toBe(
      "17 selected · 313,696 points",
    );
  });

  it("keeps the run's size alongside the selection", () => {
    // A selection count alone cannot be read: 17 of what?
    expect(counterLabel({ ...RUN, selected: 17 })).toContain("313,696 points");
  });

  it("shows loading progress rather than a total it does not have yet", () => {
    expect(counterLabel({ ...RUN, loaded: 1000 })).toBe(
      "1,000 / 313,696 points",
    );
  });

  it("still reports progress under a selection", () => {
    expect(counterLabel({ ...RUN, loaded: 1000, selected: 17 })).toBe(
      "17 selected · 1,000 / 313,696 points",
    );
  });

  it("reports what filters left in view when nothing is selected", () => {
    expect(counterLabel({ ...RUN, inView: 4200 })).toBe(
      "313,696 points · 4,200 in view",
    );
  });

  it("does not claim an in-view count under a selection", () => {
    // The plot does not re-filter itself by the Select stage a selection
    // publishes, so an "in view" number there would describe nothing
    expect(counterLabel({ ...RUN, selected: 17, inView: 4200 })).toBe(
      "17 selected · 313,696 points",
    );
  });

  it("treats an empty selection as no selection", () => {
    expect(counterLabel({ ...RUN, selected: 0 })).toBe("313,696 points");
  });
});
