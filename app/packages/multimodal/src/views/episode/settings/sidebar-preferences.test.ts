import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  __resetSidebarPreferencesForTests,
  MAX_SIDEBAR_PREFERENCE_SCOPES,
  readSidebarPreferences,
  readSidebarPreferenceScopesForTests,
  SIDEBAR_PREFERENCES_STORAGE_KEY,
  updateSidebarPreferences,
} from "./sidebar-preferences";
import { semanticSourceKey } from "./semantic-source";

describe("dataset-owned sidebar preferences", () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    __resetSidebarPreferencesForTests();
    vi.restoreAllMocks();
  });

  it("isolates preferences by dataset and media-field scope", () => {
    updateSidebarPreferences("dataset-a:field", (current) => ({
      ...current,
      appearance: { ...current.appearance, pointCloudPointSize: 7 },
    }));

    expect(
      readSidebarPreferences("dataset-a:field").appearance.pointCloudPointSize,
    ).toBe(7);
    expect(
      readSidebarPreferences("dataset-b:field").appearance.pointCloudPointSize,
    ).not.toBe(7);
    expect(
      readSidebarPreferences("dataset-a:other").appearance.pointCloudPointSize,
    ).not.toBe(7);
  });

  it("validates corrupt fields without discarding the whole scope", () => {
    localStorage.setItem(
      SIDEBAR_PREFERENCES_STORAGE_KEY,
      JSON.stringify({
        version: 1,
        byScope: {
          dataset: {
            appearance: {
              pointCloudPointSize: 999,
              referenceGrid: { enabled: false, opacityPercent: -4 },
            },
            camera: {
              cameraNavigationMode: "bogus",
              navigationCompositions: [{ kind: "not-supported" }],
              renderableSourceKeys: ["not-a-semantic-key"],
            },
            tiles: "bad",
            updatedAtMs: 1,
          },
        },
      }),
    );

    const read = readSidebarPreferences("dataset");
    expect(read.appearance.pointCloudPointSize).toBe(10);
    expect(read.appearance.referenceGrid.enabled).toBe(false);
    expect(read.camera.cameraNavigationMode).toBe("relative");
    expect(read.camera.navigationCompositions).toEqual([]);
    expect(read.camera.renderableSourceKeys).toEqual([]);
    expect(read.tiles).toEqual({});
  });

  it("normalizes missing projection stream lists to empty selections", () => {
    const imageKey = semanticSourceKey({
      sourceName: "/camera/front",
      type: "image",
    });
    localStorage.setItem(
      SIDEBAR_PREFERENCES_STORAGE_KEY,
      JSON.stringify({
        version: 1,
        byScope: {
          dataset: {
            imageProjection: { [imageKey]: { enabled: true } },
            tiles: {
              "image-1": {
                image3dLabelProjections: {
                  [imageKey]: { enabled: true },
                },
                imagePointCloudProjections: {
                  [imageKey]: { enabled: true },
                },
              },
            },
            updatedAtMs: 1,
          },
        },
      }),
    );

    const restored = readSidebarPreferences("dataset");
    expect(restored.imageProjection[imageKey]).toMatchObject({
      enabled: false,
      streams: [],
    });
    expect(
      restored.tiles["image-1"]?.image3dLabelProjections?.[imageKey],
    ).toMatchObject({ enabled: false, streams: [] });
    expect(
      restored.tiles["image-1"]?.imagePointCloudProjections?.[imageKey],
    ).toMatchObject({ enabled: false, streams: [] });
  });

  it("evicts the least recently updated scope after twenty entries", () => {
    let now = 1;
    vi.spyOn(Date, "now").mockImplementation(() => now++);
    for (let index = 0; index < MAX_SIDEBAR_PREFERENCE_SCOPES; index += 1) {
      updateSidebarPreferences(`dataset-${index}`, (current) => ({
        ...current,
        appearance: {
          ...current.appearance,
          showPointCloudColorLegend: true,
        },
      }));
    }
    updateSidebarPreferences("dataset-0", (current) => current);
    updateSidebarPreferences(
      `dataset-${MAX_SIDEBAR_PREFERENCE_SCOPES}`,
      (current) => current,
    );

    const scopes = readSidebarPreferenceScopesForTests();
    expect(Object.keys(scopes)).toHaveLength(MAX_SIDEBAR_PREFERENCE_SCOPES);
    expect(scopes["dataset-0"]).toBeDefined();
    expect(scopes["dataset-1"]).toBeUndefined();
    expect(scopes[`dataset-${MAX_SIDEBAR_PREFERENCE_SCOPES}`]).toBeDefined();
  });

  it("intentionally resets every legacy sidebar store once", () => {
    localStorage.setItem("fiftyone.episode.panel-visibility.v2", "old");
    localStorage.setItem("fiftyone.episode.modal-settings.v3", "old");
    sessionStorage.setItem("fiftyone.episode.projections.v1", "old");

    readSidebarPreferences("dataset");

    expect(
      localStorage.getItem("fiftyone.episode.panel-visibility.v2"),
    ).toBeNull();
    expect(
      localStorage.getItem("fiftyone.episode.modal-settings.v3"),
    ).toBeNull();
    expect(
      sessionStorage.getItem("fiftyone.episode.projections.v1"),
    ).toBeNull();
  });
});
