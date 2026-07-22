import { Quaternion, Vector3 } from "three";
import { describe, expect, it } from "vitest";
import type { EpisodeFrameGraphSummary } from "../../../../runtime/frame-transforms";
import {
  chooseEpisodeCameraTarget,
  createEpisodeReferenceSelectionState,
  deriveEpisodeReferenceDecision,
  episodeReferenceSelectionReducer,
  type EpisodeReferenceFacts,
} from "./reference-selection";

describe("episode 3D reference selection", () => {
  it("waits for data evidence instead of choosing an arbitrary transform island", () => {
    const emptyFacts = facts({
      components: [["base_link", "world"]],
      observations: [],
      primarySourceId: null,
    });

    expect(deriveEpisodeReferenceDecision(emptyFacts).referenceFrameId).toBe(
      "",
    );

    const observedFacts = facts({
      components: [["base_link", "world"]],
      observations: [{ frameIds: ["base_link"], sourceId: "/pose" }],
      primarySourceId: "/pose",
    });
    let state = createEpisodeReferenceSelectionState(observedFacts);
    state = episodeReferenceSelectionReducer(state, {
      facts: emptyFacts,
      type: "factsChanged",
    });
    expect(state.decision.referenceFrameId).toBe("world");
  });

  it("keeps a disconnected primary point cloud visible instead of choosing world", () => {
    const decision = deriveEpisodeReferenceDecision(
      facts({
        components: [["base_link", "world"]],
        observations: [
          { frameIds: ["velodyne"], sourceId: "/points" },
          { frameIds: ["base_link"], sourceId: "/camera/info" },
        ],
        primarySourceId: "/points",
      }),
    );

    expect(decision).toMatchObject({
      activeComponentFrameIds: ["velodyne"],
      omittedFrameIds: ["base_link", "world"],
      omittedSourceIds: ["/camera/info"],
      referenceFrameId: "velodyne",
      source: "auto-local",
    });
  });

  it("uses primary-source frame membership before other selected sources", () => {
    const decision = deriveEpisodeReferenceDecision(
      facts({
        components: [["a"], ["b", "world"]],
        observations: [
          { frameIds: ["a"], sourceId: "/labels-1" },
          { frameIds: ["a"], sourceId: "/labels-2" },
          { frameIds: ["b"], sourceId: "/points" },
        ],
        primarySourceId: "/points",
      }),
    );

    expect(decision.activeComponentFrameIds).toEqual(["b", "world"]);
    expect(decision.referenceFrameId).toBe("world");
  });

  it("counts each source once per component when the primary has no frame", () => {
    const decision = deriveEpisodeReferenceDecision(
      facts({
        components: [["a"], ["b"]],
        observations: [
          // Repeated entity frame ids cannot add weight.
          { frameIds: ["a", "a", "a"], sourceId: "/labels" },
          { frameIds: ["b"], sourceId: "/camera" },
        ],
        primarySourceId: "/missing-primary",
      }),
    );

    expect(decision.activeComponentId).toBe("a");
  });

  it("never targets an ego frame outside the active component", () => {
    expect(chooseEpisodeCameraTarget(["velodyne"], "velodyne")).toBe(
      "velodyne",
    );
    expect(chooseEpisodeCameraTarget(["base_link", "map"], "map")).toBe(
      "base_link",
    );
  });

  it("guards local-to-stable promotion and ignores a stale completion after user takeover", () => {
    const localFacts = facts({
      components: [["velodyne"], ["world"]],
      observations: [{ frameIds: ["velodyne"], sourceId: "/points" }],
      primarySourceId: "/points",
      revisionKey: "local",
    });
    const connectedFacts = facts({
      components: [["velodyne", "world"]],
      observations: [{ frameIds: ["velodyne"], sourceId: "/points" }],
      primarySourceId: "/points",
      revisionKey: "connected",
    });
    let state = createEpisodeReferenceSelectionState(localFacts);
    state = episodeReferenceSelectionReducer(state, {
      facts: connectedFacts,
      timeNs: 42n,
      type: "factsChanged",
    });
    const promotionKey = state.pendingPromotion?.key;
    expect(promotionKey).toBeTruthy();
    expect(state.decision.referenceFrameId).toBe("velodyne");

    state = episodeReferenceSelectionReducer(state, {
      frameId: "velodyne",
      type: "userReferenceSelected",
    });
    expect(state.pendingPromotion).toBeNull();
    state = episodeReferenceSelectionReducer(state, {
      key: promotionKey ?? "",
      transform: frameTransform("velodyne", "world"),
      type: "promotionResolved",
    });
    expect(state.decision).toMatchObject({
      referenceFrameId: "velodyne",
      source: "user",
    });
  });

  it("commits a matching promotion exactly once", () => {
    const localFacts = facts({
      components: [["lidar"], ["world"]],
      observations: [{ frameIds: ["lidar"], sourceId: "/points" }],
      primarySourceId: "/points",
      revisionKey: "1",
    });
    const connectedFacts = facts({
      components: [["lidar", "world"]],
      observations: [{ frameIds: ["lidar"], sourceId: "/points" }],
      primarySourceId: "/points",
      revisionKey: "2",
    });
    let state = createEpisodeReferenceSelectionState(localFacts);
    state = episodeReferenceSelectionReducer(state, {
      facts: connectedFacts,
      type: "factsChanged",
    });
    const key = state.pendingPromotion?.key ?? "";
    state = episodeReferenceSelectionReducer(state, {
      key,
      transform: frameTransform("lidar", "world"),
      type: "promotionResolved",
    });
    expect(state.decision).toMatchObject({
      referenceFrameId: "world",
      source: "auto-stable",
    });
    expect(state.committedTransition).toMatchObject({
      key,
      sourceFrameId: "lidar",
      targetFrameId: "world",
    });
    expect(state.pendingPromotion).toBeNull();
    expect(
      episodeReferenceSelectionReducer(state, {
        key,
        transform: frameTransform("lidar", "world"),
        type: "promotionResolved",
      }),
    ).toBe(state);
  });
});

function facts({
  components,
  observations,
  primarySourceId,
  revisionKey = "revision",
}: {
  readonly components: readonly (readonly string[])[];
  readonly observations: EpisodeReferenceFacts["observations"];
  readonly primarySourceId: string | null;
  readonly revisionKey?: string;
}): EpisodeReferenceFacts {
  const frameIds = [...new Set(components.flatMap((component) => component))];
  const graphSummary: EpisodeFrameGraphSummary = {
    components,
    dataBearingReachableCountsByFrameId: new Map(),
    reachableCountsByFrameId: new Map(),
    roots: components.flatMap((component) => component.slice(0, 1)),
    tfConnectedFrameIds: frameIds,
  };
  return { graphSummary, observations, primarySourceId, revisionKey };
}

function frameTransform(sourceFrameId: string, targetFrameId: string) {
  return {
    rotation: new Quaternion(),
    sourceFrameId,
    targetFrameId,
    translation: new Vector3(),
  };
}
