import { open, stat } from "node:fs/promises";
import { basename } from "node:path";
import { describe, expect, it } from "vitest";
import type {
  EpisodeTransformTopologyEdgeObservation,
  EpisodeTransformTopologyFrameUse,
} from "../../ir";
import type {
  ByteResources,
  EpisodeSource,
  ReadContinuation,
} from "../../ports";
import { analyzeTransformTopology } from "../../runtime";
import { createMcapFormatAdapter } from "./format-adapter";
import { createMcapResourceClient } from "./resource-client-factory";

const REAL_MCAP_PATH = process.env.FIFTYONE_TRANSFORM_TOPOLOGY_MCAP;
const GRANT = {
  maxMessages: 10_000,
  maxSourceBytes: 16 * 1024 * 1024,
  maxUncompressedBytes: 32 * 1024 * 1024,
  maxWallTimeMs: 500,
} as const;
const MAX_EXPLICIT_SLICES = 8;

describe.skipIf(!REAL_MCAP_PATH)("real MCAP transform topology smoke", () => {
  it("reports topology without exceeding eight explicit modest grants", async () => {
    const path = REAL_MCAP_PATH as string;
    const fileStat = await stat(path);
    const handle = await open(path, "r");
    const descriptor = {
      sizeBytes: fileStat.size.toString(),
      sourceId: basename(path),
      url: `file://${path}`,
    };
    const bytes: ByteResources = {
      readBytes: async (request) => {
        const length = Number(request.range.length);
        const output = new Uint8Array(length);
        const { bytesRead } = await handle.read(
          output,
          0,
          length,
          Number(request.range.offset),
        );
        if (bytesRead !== length) {
          throw new Error(
            `Short MCAP read: expected ${length}, got ${bytesRead}`,
          );
        }
        return { bytes: output, range: request.range, source: request.source };
      },
    };
    const source: EpisodeSource = {
      assets: {
        list: () =>
          Promise.resolve([
            {
              id: "recording",
              mediaType: "application/x-mcap",
              role: "recording",
            },
          ]),
        resolve: () => Promise.resolve(descriptor),
      },
      episodeId: "real-transform-topology-smoke",
    };
    const session = await createMcapFormatAdapter({
      createClient: (io) => createMcapResourceClient({ byteClient: io }),
    }).open(source, bytes);
    try {
      expect(session.transformTopology).toBeDefined();
      const edges: EpisodeTransformTopologyEdgeObservation[] = [];
      let frameUses: readonly EpisodeTransformTopologyFrameUse[] = [];
      let continuation: ReadContinuation | undefined;
      let slices = 0;
      let sourceBytes = 0;
      let stopReason = "not-started";
      let unavailableSpanCount = 0;
      do {
        const result = await session.transformTopology?.scan({
          budget: GRANT,
          continuation,
        });
        if (!result) throw new Error("Transform topology capability vanished");
        expect(result.usage.logicalSourceBytes).toBeLessThanOrEqual(
          GRANT.maxSourceBytes,
        );
        expect(result.usage.logicalUncompressedBytes).toBeLessThanOrEqual(
          GRANT.maxUncompressedBytes,
        );
        expect(result.usage.messagesDecoded).toBeLessThanOrEqual(
          GRANT.maxMessages,
        );
        expect(result.usage.chunksOpened).toBeLessThanOrEqual(4);
        edges.push(...result.edges);
        if (result.frameUses.length > 0) frameUses = result.frameUses;
        continuation = result.continuation;
        sourceBytes += result.usage.logicalSourceBytes;
        stopReason = result.stopReason;
        unavailableSpanCount += result.unavailableByStream
          ? [...result.unavailableByStream.values()].reduce(
              (count, windows) => count + windows.length,
              0,
            )
          : 0;
        slices += 1;
      } while (continuation && slices < MAX_EXPLICIT_SLICES);

      const analysis = analyzeTransformTopology(edges, frameUses);
      const findings = {
        componentCount: analysis.summary.componentCount,
        edgeCount: analysis.summary.edgeCount,
        frameCount: analysis.summary.frameCount,
        issueKinds: analysis.issues.map((issue) => issue.kind),
        dataBearingFrames: analysis.frames
          .filter((frame) => frame.dataBearing)
          .map((frame) => frame.id),
        mismatchSuggestions: analysis.issues.flatMap((issue) =>
          issue.suggestion ? [issue.suggestion] : [],
        ),
        slices,
        sourceBytes,
        stopReason,
        unavailableSpanCount,
      };
      console.info("REAL_TRANSFORM_TOPOLOGY_FINDINGS", findings);

      if (basename(path).startsWith("police-brescia-ospedale_blurred_0")) {
        expect(analysis.summary.edgeCount).toBe(23);
        expect(analysis.summary.componentCount).toBeGreaterThanOrEqual(2);
        expect(
          analysis.issues.some((issue) => issue.kind === "disconnected-data"),
        ).toBe(true);
        expect(
          analysis.issues.some(
            (issue) =>
              issue.kind === "frame-name-mismatch" &&
              issue.affectedFrameIds.some((id) => id.includes("lucid_cam")),
          ),
        ).toBe(true);
      }
      expect(sourceBytes).toBeLessThanOrEqual(
        MAX_EXPLICIT_SLICES * GRANT.maxSourceBytes,
      );
    } finally {
      session.dispose();
      await handle.close();
    }
  }, 120_000);
});
