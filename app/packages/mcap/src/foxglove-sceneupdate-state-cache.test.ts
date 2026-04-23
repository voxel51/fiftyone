import { afterEach, describe, expect, it, vi } from "vitest";
import { FoxgloveSceneUpdateStateCache } from "./foxglove-sceneupdate-state-cache";

const { decodeFoxgloveSceneUpdatePayloadMock } = vi.hoisted(() => ({
  decodeFoxgloveSceneUpdatePayloadMock: vi.fn(),
}));

vi.mock("./foxglove-sceneupdate-decoder", () => ({
  decodeFoxgloveSceneUpdatePayload: decodeFoxgloveSceneUpdatePayloadMock,
}));

describe("FoxgloveSceneUpdateStateCache", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("replays correctly after bounded decoded-update and checkpoint caches evict older entries", async () => {
    decodeFoxgloveSceneUpdatePayloadMock.mockImplementation(
      (payload: Uint8Array) => {
        switch (payload[0]) {
          case 1:
            return {
              deletions: [],
              entities: [
                {
                  id: "entity-a",
                  frameId: "map",
                  timestampNs: 10,
                  expiresAtNs: null,
                  warnings: [],
                  primitives: [
                    {
                      kind: "points",
                      id: "a",
                      frameId: "map",
                      pointCount: 1,
                      positions: new Float32Array([1, 0, 0]),
                      intensity: null,
                      colors: null,
                      solidColor: null,
                      pointSize: null,
                    },
                  ],
                },
              ],
            };
          case 2:
            return {
              deletions: [],
              entities: [
                {
                  id: "entity-b",
                  frameId: "map",
                  timestampNs: 20,
                  expiresAtNs: null,
                  warnings: [],
                  primitives: [
                    {
                      kind: "points",
                      id: "b",
                      frameId: "map",
                      pointCount: 1,
                      positions: new Float32Array([2, 0, 0]),
                      intensity: null,
                      colors: null,
                      solidColor: null,
                      pointSize: null,
                    },
                  ],
                },
              ],
            };
          case 3:
            return {
              deletions: [
                {
                  timestampNs: 30,
                  type: 0,
                  id: "entity-a",
                },
              ],
              entities: [],
            };
          default:
            return {
              deletions: [],
              entities: [],
            };
        }
      }
    );
    const cache = new FoxgloveSceneUpdateStateCache({
      datasetId: "dataset-1",
      sampleId: "sample-1",
      sceneId: "scene-1",
      streamId: "/scene",
      mediaField: "filepath",
      sourceKind: "mcap",
      sceneRange: { startNs: 0, endNs: 100 },
      maxDecodedUpdateEntries: 1,
      maxCheckpointEntries: 1,
    });
    const messages = [
      {
        messageId: "scene-1",
        logTimeNs: 10,
        publishTimeNs: 10,
        syncTimestampNs: 10,
        payload: Uint8Array.of(1),
      },
      {
        messageId: "scene-2",
        logTimeNs: 20,
        publishTimeNs: 20,
        syncTimestampNs: 20,
        payload: Uint8Array.of(2),
      },
      {
        messageId: "scene-3",
        logTimeNs: 30,
        publishTimeNs: 30,
        syncTimestampNs: 30,
        payload: Uint8Array.of(3),
      },
    ];
    cache.primeMessages(messages, { startNs: 0, endNs: 100 });

    const latestFrame = await cache.decodeMessage(messages[2] as any);
    expect(latestFrame.frame.primitives).toHaveLength(1);
    expect(latestFrame.frame.primitives[0].id).toBe("b");

    const replayedFrame = await cache.decodeMessage(messages[1] as any);
    expect(replayedFrame.frame.primitives).toHaveLength(2);
    expect(
      replayedFrame.frame.primitives.map((primitive) => primitive.id)
    ).toEqual(["a", "b"]);
    expect(decodeFoxgloveSceneUpdatePayloadMock).toHaveBeenCalledTimes(5);

    cache.dispose();
  });
});
