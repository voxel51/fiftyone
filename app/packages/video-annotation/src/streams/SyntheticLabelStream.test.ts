import { describe, expect, it } from "vitest";
import {
  getPresenceIntervals,
  isPresent,
  resolveActor,
  type SyntheticActor,
  type SyntheticActorSpec,
} from "./SyntheticLabelStream";

function makeActor(overrides: Partial<SyntheticActor> = {}): SyntheticActor {
  return {
    id: "a",
    label: "person",
    width: 0.1,
    height: 0.1,
    xPeriodSec: 10,
    yPeriodSec: 10,
    xPhase: 0,
    yPhase: 0,
    presenceCycleSec: 10,
    presenceDuty: 0.5,
    presencePhase: 0,
    ...overrides,
  };
}

describe("resolveActor", () => {
  it("projects per-clip cycle counts onto absolute periods", () => {
    const spec: SyntheticActorSpec = {
      id: "a",
      label: "person",
      width: 0.1,
      height: 0.1,
      xCyclesPerClip: 1,
      yCyclesPerClip: 0.5,
      xPhase: 0,
      yPhase: 0,
      presenceCyclesPerClip: 2,
      presenceDuty: 0.5,
      presencePhase: 0,
    };

    const actor = resolveActor(spec, 10);
    expect(actor.xPeriodSec).toBe(10);
    expect(actor.yPeriodSec).toBe(20);
    expect(actor.presenceCycleSec).toBe(5);
  });

  it("guards a zero-length clip against divide-by-zero", () => {
    const actor = resolveActor(
      {
        id: "a",
        label: "person",
        width: 0.1,
        height: 0.1,
        xCyclesPerClip: 1,
        yCyclesPerClip: 1,
        xPhase: 0,
        yPhase: 0,
        presenceCyclesPerClip: 1,
        presenceDuty: 0.5,
        presencePhase: 0,
      },
      0,
    );
    expect(Number.isFinite(actor.xPeriodSec)).toBe(true);
  });
});

describe("isPresent", () => {
  it("is in frame for the duty fraction of each cycle", () => {
    const actor = makeActor({ presenceCycleSec: 10, presenceDuty: 0.5 });
    expect(isPresent(0, actor)).toBe(true);
    expect(isPresent(4, actor)).toBe(true);
    expect(isPresent(6, actor)).toBe(false);
    // Next cycle wraps back to present.
    expect(isPresent(10, actor)).toBe(true);
  });
});

describe("getPresenceIntervals", () => {
  it("returns empty for a non-positive duration", () => {
    expect(getPresenceIntervals(makeActor(), 0)).toEqual([]);
  });

  it("clips intervals to [0, duration]", () => {
    const actor = makeActor({ presenceCycleSec: 10, presenceDuty: 0.5 });
    expect(getPresenceIntervals(actor, 10)).toEqual([
      { startSec: 0, endSec: 5 },
    ]);
  });

  it("captures phased intervals across multiple cycles", () => {
    const actor = makeActor({
      presenceCycleSec: 10,
      presenceDuty: 0.5,
      presencePhase: 0.5,
    });
    expect(getPresenceIntervals(actor, 20)).toEqual([
      { startSec: 5, endSec: 10 },
      { startSec: 15, endSec: 20 },
    ]);
  });
});
