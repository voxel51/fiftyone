import { describe, expect, it } from "vitest";
import {
  DEFAULT_SIDEBAR_PREFERENCES,
  type SidebarPreferences,
} from "../settings/sidebar-preferences";
import {
  parsePortableLayout,
  portableLayoutChangeKey,
  serializePortableLayout,
} from "./portable-layout";

const capture = () =>
  serializePortableLayout(
    { layout: "image-1", rawStreams: {}, plotSeries: {}, tileTitles: {} },
    {},
    DEFAULT_SIDEBAR_PREFERENCES,
  );

describe("portable layouts", () => {
  it("roundtrips complete semantic source and display preferences", () => {
    const source = JSON.stringify(["image", "/front/camera"]);
    const preferences = {
      ...DEFAULT_SIDEBAR_PREFERENCES,
      tiles: { "image-1": { imageSourceKey: source } },
      appearance: {
        ...DEFAULT_SIDEBAR_PREFERENCES.appearance,
        pointCloudPointSize: 4,
      },
    };
    const json = serializePortableLayout(
      {
        layout: "image-1",
        expandedTileId: "image-1",
        cameraPreferences: { otherField: { sceneUpAxis: "y" } },
      },
      { sceneUpAxis: "z", preferredWorldFrameId: "map" },
      preferences,
    );
    expect(parsePortableLayout(json)).toMatchObject({
      preferences,
      camera: { sceneUpAxis: "z", preferredWorldFrameId: "map" },
      modal: { layout: "image-1" },
    });
    expect(json).not.toContain("otherField");
    expect(json).not.toContain("expandedTileId");
    expect(json).not.toContain("cameraPreferences");
  });
  it("change keys ignore runtime camera re-expression but not user settings", () => {
    // Numbers observed live: the same loaded layout, re-recorded by the 3D
    // camera after its restore resolved, without any user interaction.
    const saved = cameraPreferences(
      [365.97177174755234, 150.3920056532537, 331.2239290865147],
      [11.629509928433663, -14.14452572474238, 4.154212839841449],
      4.003792989784544,
      [0.695450412495756, 0.3229278890697489, 0.6419239068771616],
    );
    const reexpressed = cameraPreferences(
      [-461.523666618835, -198.11704692442106, 107.3299593463782],
      [3.7440425869199316, -17.95539271282803, 4.019528717100647],
      4.003792989784272,
      [-0.9131584209768717, -0.35359456163695563, 0.20276238354240134],
      ['["point-cloud","/LIDAR_TOP"]'],
    );
    const withCamera = (
      camera: typeof saved,
      modal: Parameters<typeof serializePortableLayout>[0] = {
        layout: "image-1",
      },
      conventions: Parameters<typeof serializePortableLayout>[1] = {},
    ) =>
      serializePortableLayout(modal, conventions, {
        ...DEFAULT_SIDEBAR_PREFERENCES,
        camera,
      });
    const baseline = portableLayoutChangeKey(withCamera(saved));
    expect(portableLayoutChangeKey(withCamera(reexpressed))).toBe(baseline);
    // Captures still carry the live pose, so saving publishes it.
    expect(
      parsePortableLayout(withCamera(reexpressed)).preferences.camera
        .navigationCompositions[0],
    ).toMatchObject({
      relativePosition: [
        -461.523666618835, -198.11704692442106, 107.3299593463782,
      ],
    });
    const reversed = JSON.stringify(
      Object.fromEntries(
        Object.entries(JSON.parse(withCamera(saved))).reverse(),
      ),
    );
    expect(reversed).not.toBe(withCamera(saved));
    expect(portableLayoutChangeKey(reversed)).toBe(baseline);
    // Deliberate choices still count: navigation mode, conventions, tiles.
    expect(
      portableLayoutChangeKey(
        withCamera({ ...saved, cameraNavigationMode: "absolute" }),
      ),
    ).not.toBe(baseline);
    expect(
      portableLayoutChangeKey(
        withCamera(saved, { layout: "image-1" }, { sceneUpAxis: "y" }),
      ),
    ).not.toBe(baseline);
    expect(
      portableLayoutChangeKey(withCamera(saved, { layout: "image-2" })),
    ).not.toBe(baseline);
    expect(() => portableLayoutChangeKey('{"format":"other"}')).toThrow();
  });
  it("normalizes empty live tile maps before export", () => {
    expect(parsePortableLayout(capture()).modal.layout).toBe("image-1");
  });
  it.each([
    [
      "version",
      (value: Record<string, unknown>) => {
        value.version = 2;
      },
    ],
    [
      "unknown fields",
      (value: Record<string, unknown>) => {
        value.sampleId = "recording";
      },
    ],
    [
      "invalid preferences",
      (value: Record<string, unknown>) => {
        value.preferences = {
          ...DEFAULT_SIDEBAR_PREFERENCES,
          tiles: { "image-1": { imageSourceKey: "runtime-123" } },
        };
      },
    ],
    [
      "duplicate tiles",
      (value: Record<string, unknown>) => {
        value.modal = {
          layout: { direction: "row", first: "image-1", second: "image-1" },
        };
      },
    ],
    [
      "runtime fields",
      (value: Record<string, unknown>) => {
        value.modal = { layout: "image-1", signedUrl: "https://example.com" };
      },
    ],
  ])("rejects %s instead of partially applying", (_, change) => {
    const value = JSON.parse(capture()) as Record<string, unknown>;
    change(value);
    expect(() => parsePortableLayout(JSON.stringify(value))).toThrow();
  });
  it("bounds bytes and nesting before recursive sanitization", () => {
    expect(() => parsePortableLayout(" ".repeat(262145))).toThrow(/256 KiB/);
    expect(() => parsePortableLayout('{"__proto__":{}}')).toThrow(/key/);
    const value = JSON.parse(capture()) as { modal: { layout: unknown } };
    for (let i = 0; i < 30; i++)
      value.modal.layout = {
        direction: "row",
        first: `image-${i + 2}`,
        second: value.modal.layout,
      };
    expect(() => parsePortableLayout(JSON.stringify(value))).toThrow(/complex/);
  });
});

function cameraPreferences(
  relativePosition: readonly [number, number, number],
  relativeTarget: readonly [number, number, number],
  distanceInRadii: number,
  viewDirection: readonly [number, number, number],
  renderableSourceKeys: readonly string[] | null = null,
): SidebarPreferences["camera"] {
  return {
    cameraNavigationMode: "relative" as const,
    navigationCompositions: [
      {
        kind: "target-relative" as const,
        relativePosition,
        relativeTarget,
        rotationMode: "position" as const,
        sceneUpAxis: "z" as const,
        targetFrameId: "base_link",
        trackingMode: "position" as const,
      },
      {
        distanceInRadii,
        kind: "bounds-normalized" as const,
        sceneUpAxis: "z" as const,
        targetOffsetInRadii: [
          7.924966999494827, 4.79494498783065, 0.0141,
        ] as const,
        trackingMode: "position" as const,
        viewDirection,
      },
    ],
    renderableSourceKeys,
  };
}
