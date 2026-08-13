import { describe, expect, it } from "vitest";
import type {
  EpisodeTransformTopologyEdgeObservation,
  EpisodeTransformTopologyFrameUse,
} from "../ir";
import { analyzeTransformTopology } from "./transform-topology";
import { layoutTransformTopology } from "./transform-topology-layout";

const observation = (
  parentFrameId: string,
  childFrameId: string,
  overrides: Partial<EpisodeTransformTopologyEdgeObservation> = {},
): EpisodeTransformTopologyEdgeObservation => ({
  childFrameId,
  kind: "temporal",
  occurrenceCount: 1,
  parentFrameId,
  sourceName: "/tf",
  sourceStreamId: "tf",
  ...overrides,
});

const frameUse = (
  frameId: string,
  streamId = frameId,
): EpisodeTransformTopologyFrameUse => ({
  frameId,
  sourceName: `/${streamId}`,
  streamId,
});

describe("transform topology model", () => {
  it("aggregates source-qualified static and temporal evidence as mixed", () => {
    const analysis = analyzeTransformTopology(
      [
        observation("map", "base", {
          firstObservedTimeNs: 10n,
          kind: "static",
          lastObservedTimeNs: 10n,
          occurrenceCount: 2,
          sourceName: "/tf_static",
          sourceStreamId: "static",
        }),
        observation("map", "base", {
          firstObservedTimeNs: 20n,
          lastObservedTimeNs: 30n,
          occurrenceCount: 4,
        }),
      ],
      [frameUse("base", "points")],
    );

    expect(analysis.edges).toEqual([
      expect.objectContaining({
        firstObservedTimeNs: 10n,
        kind: "mixed",
        lastObservedTimeNs: 30n,
        occurrenceCount: 6,
        sourceNames: ["/tf", "/tf_static"],
        sources: [
          {
            kind: "temporal",
            sourceName: "/tf",
            sourceStreamIds: ["tf"],
          },
          {
            kind: "static",
            sourceName: "/tf_static",
            sourceStreamIds: ["static"],
          },
        ],
      }),
    ]);
    expect(analysis.frames).toEqual([
      expect.objectContaining({
        id: "base",
        transformSources: [
          expect.objectContaining({ kind: "temporal", sourceName: "/tf" }),
          expect.objectContaining({
            kind: "static",
            sourceName: "/tf_static",
          }),
        ],
      }),
      expect.objectContaining({
        id: "map",
        transformSources: [
          expect.objectContaining({ kind: "temporal", sourceName: "/tf" }),
          expect.objectContaining({
            kind: "static",
            sourceName: "/tf_static",
          }),
        ],
      }),
    ]);
    expect(analysis.summary).toEqual({
      componentCount: 1,
      edgeCount: 1,
      frameCount: 2,
    });
  });

  it("orders data-bearing disconnected components before ornamental islands", () => {
    const analysis = analyzeTransformTopology(
      [observation("z-root", "z-sensor"), observation("a-root", "a-leaf")],
      [frameUse("z-sensor", "camera")],
    );

    expect(analysis.components.map((component) => component.id)).toEqual([
      "z-root",
      "a-leaf",
    ]);
    expect(analysis.components[0]?.dataBearingFrameCount).toBe(1);
    expect(
      analysis.issues.find((issue) => issue.kind === "disconnected-components"),
    ).toMatchObject({ severity: "warning" });
  });

  it("warns when transform-only components are disconnected", () => {
    const analysis = analyzeTransformTopology(
      [observation("map", "oxts"), observation("odom", "base_link")],
      [],
    );

    expect(analysis.issues).toEqual([
      expect.objectContaining({
        affectedFrameIds: ["base_link", "map", "odom", "oxts"],
        kind: "disconnected-components",
        severity: "warning",
        title: "Transform graph is disconnected",
      }),
    ]);
  });

  it("reports data-bearing streams split across disconnected components", () => {
    const analysis = analyzeTransformTopology(
      [observation("map", "lidar"), observation("world", "camera")],
      [frameUse("lidar", "points"), frameUse("camera", "front-camera")],
    );

    expect(
      analysis.issues.find((issue) => issue.kind === "disconnected-data"),
    ).toMatchObject({ severity: "error" });
    expect(
      analysis.issues.some((issue) => issue.kind === "disconnected-components"),
    ).toBe(false);
  });

  it("retains cycles and conflicting relationships as actionable issues", () => {
    const analysis = analyzeTransformTopology(
      [
        observation("a", "b"),
        observation("b", "c"),
        observation("c", "a"),
        observation("other", "b"),
        observation("self", "self"),
      ],
      [frameUse("b")],
    );

    expect(analysis.issues.map((issue) => issue.kind)).toEqual(
      expect.arrayContaining(["cycle", "multiple-parents", "self-edge"]),
    );
    expect(analysis.summary.edgeCount).toBe(5);
  });

  it("suggests separator-only frame-name mismatches without merging them", () => {
    const analysis = analyzeTransformTopology(
      [observation("base", "lucid_cam_front_center")],
      [frameUse("lucid_cam/front_center", "front-camera")],
    );

    expect(analysis.summary.componentCount).toBe(2);
    expect(
      analysis.issues.find((issue) => issue.kind === "frame-name-mismatch"),
    ).toMatchObject({
      affectedFrameIds: ["lucid_cam/front_center", "lucid_cam_front_center"],
      suggestion: "lucid_cam_front_center",
    });
  });

  it("handles long acyclic chains without relying on call-stack depth", () => {
    const edgeCount = 12_000;
    const analysis = analyzeTransformTopology(
      Array.from({ length: edgeCount }, (_, index) =>
        observation(`frame-${index}`, `frame-${index + 1}`),
      ),
      [],
    );

    expect(analysis.summary.edgeCount).toBe(edgeCount);
    expect(analysis.summary.frameCount).toBe(edgeCount + 1);
    expect(analysis.issues.some((issue) => issue.kind === "cycle")).toBe(false);
  });
});

describe("transform topology layout", () => {
  it("returns no nodes for empty evidence", () => {
    const layout = layoutTransformTopology(analyzeTransformTopology([], []));

    expect(layout.nodes).toEqual([]);
  });

  it("is deterministic and cycle-safe", () => {
    const analysis = analyzeTransformTopology(
      [observation("b", "c"), observation("c", "a"), observation("a", "b")],
      [frameUse("a")],
    );

    const first = layoutTransformTopology(analysis);
    const second = layoutTransformTopology(analysis);

    expect(second).toEqual(first);
    expect(first.nodes.map((node) => node.frameId).sort()).toEqual([
      "a",
      "b",
      "c",
    ]);
  });
});
