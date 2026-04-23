import { afterEach, describe, expect, it, vi } from "vitest";

const { decodeFoxgloveSceneUpdateMessageMock } = vi.hoisted(() => ({
  decodeFoxgloveSceneUpdateMessageMock: vi.fn(),
}));

vi.mock("./foxglove-protobuf", async () => {
  const actual = await vi.importActual<typeof import("./foxglove-protobuf")>(
    "./foxglove-protobuf"
  );

  return {
    ...actual,
    decodeFoxgloveSceneUpdateMessage: decodeFoxgloveSceneUpdateMessageMock,
  };
});

const { decodeFoxgloveSceneUpdatePayload } = await import(
  "./foxglove-sceneupdate-decoder"
);

describe("decodeFoxgloveSceneUpdatePayload", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("prefers .label for color grouping and falls back to .category", () => {
    decodeFoxgloveSceneUpdateMessageMock.mockReturnValue({
      deletions: [],
      entities: [
        {
          id: "entity-1",
          frameId: "map",
          timestamp: { seconds: 1, nanos: 0 },
          metadata: [
            { key: ".label", value: "car" },
            { key: ".category", value: "vehicle" },
          ],
          lines: [
            {
              type: 0,
              points: [
                { x: 0, y: 0, z: 0 },
                { x: 1, y: 0, z: 0 },
              ],
            },
          ],
        },
        {
          id: "entity-2",
          frameId: "map",
          timestamp: { seconds: 1, nanos: 0 },
          metadata: [
            { key: ".label", value: "car" },
            { key: ".category", value: "person" },
          ],
          lines: [
            {
              type: 0,
              points: [
                { x: 0, y: 1, z: 0 },
                { x: 1, y: 1, z: 0 },
              ],
            },
          ],
        },
        {
          id: "entity-3",
          frameId: "map",
          timestamp: { seconds: 1, nanos: 0 },
          metadata: [{ key: ".category", value: "vehicle" }],
          lines: [
            {
              type: 0,
              points: [
                { x: 0, y: 2, z: 0 },
                { x: 1, y: 2, z: 0 },
              ],
            },
          ],
        },
        {
          id: "entity-4",
          frameId: "map",
          timestamp: { seconds: 1, nanos: 0 },
          metadata: [{ key: ".category", value: "vehicle" }],
          lines: [
            {
              type: 0,
              points: [
                { x: 0, y: 3, z: 0 },
                { x: 1, y: 3, z: 0 },
              ],
            },
          ],
        },
      ],
    });

    const decoded = decodeFoxgloveSceneUpdatePayload(new Uint8Array([1]));
    const [first, second, third, fourth] = decoded.entities;

    expect(first.semantic.title).toBe("car");
    expect(second.semantic.title).toBe("car");
    expect(third.semantic.title).toBe("vehicle");
    expect(fourth.semantic.title).toBe("vehicle");

    expect(first.primitives[0]?.solidColor).toBe(
      second.primitives[0]?.solidColor
    );
    expect(third.primitives[0]?.solidColor).toBe(
      fourth.primitives[0]?.solidColor
    );
    expect(first.primitives[0]?.solidColor).toMatch(/^#/);
  });
});
