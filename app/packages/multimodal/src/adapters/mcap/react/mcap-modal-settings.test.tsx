import { act, cleanup, renderHook } from "@testing-library/react";
import React from "react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  DEFAULT_MCAP_FIDELITY_MODE,
  DEFAULT_MCAP_REFERENCE_GRID,
  DEFAULT_MCAP_SCENE_BACKGROUND,
  DEFAULT_MCAP_TEMPORAL_POLICY,
  McapModalSettingsProvider,
  readMcapModalSettings,
  useMcapModalSettings,
  writeMcapModalSettings,
} from "./mcap-modal-settings";

const STORAGE_KEY = "fiftyone.mcap.modal-settings";

describe("mcap-modal-settings", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => cleanup());

  it("returns default settings when nothing is stored", () => {
    expect(readMcapModalSettings()).toEqual({
      version: 2,
      fidelityMode: DEFAULT_MCAP_FIDELITY_MODE,
      imageLabelTopics: {},
      referenceGrid: DEFAULT_MCAP_REFERENCE_GRID,
      sceneBackground: DEFAULT_MCAP_SCENE_BACKGROUND,
      temporalPolicy: DEFAULT_MCAP_TEMPORAL_POLICY,
    });
  });

  it("round-trips fidelity mode and image label topics", () => {
    writeMcapModalSettings({
      version: 2,
      fidelityMode: "as-recorded",
      imageLabelTopics: {
        "/camera/front": ["/labels/front", "/labels/all"],
      },
      referenceGrid: { enabled: false, opacityPercent: 50, spacingM: 5 },
      sceneBackground: { mode: "abyss", solidColor: "#112233" },
      temporalPolicy: {
        boundaryClampMs: 0,
        maxInterpolationGapMs: 500,
        staleMediaWarningMs: 250,
        transformGapWarningMs: 1500,
      },
    });

    expect(readMcapModalSettings()).toEqual({
      version: 2,
      fidelityMode: "as-recorded",
      imageLabelTopics: {
        "/camera/front": ["/labels/front", "/labels/all"],
      },
      referenceGrid: { enabled: false, opacityPercent: 50, spacingM: 5 },
      sceneBackground: { mode: "abyss", solidColor: "#112233" },
      temporalPolicy: {
        boundaryClampMs: 0,
        maxInterpolationGapMs: 500,
        staleMediaWarningMs: 250,
        transformGapWarningMs: 1500,
      },
    });
  });

  it("rejects unknown fidelity modes", () => {
    writeMcapModalSettings({
      version: 2,
      fidelityMode: "plaid" as never,
      imageLabelTopics: {},
      referenceGrid: DEFAULT_MCAP_REFERENCE_GRID,
      sceneBackground: DEFAULT_MCAP_SCENE_BACKGROUND,
      temporalPolicy: DEFAULT_MCAP_TEMPORAL_POLICY,
    });

    expect(readMcapModalSettings().fidelityMode).toBe(
      DEFAULT_MCAP_FIDELITY_MODE,
    );
  });

  it("migrates v1 payloads with interpolation enabled to smooth", () => {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        version: 1,
        imageLabelTopics: { "/camera/front": ["/labels/front"] },
        interpolate2dAnnotations: true,
        interpolate3dAnnotations: true,
        temporalPolicy: DEFAULT_MCAP_TEMPORAL_POLICY,
      }),
    );

    const read = readMcapModalSettings();
    expect(read.version).toBe(2);
    expect(read.fidelityMode).toBe("smooth");
    expect(read.imageLabelTopics["/camera/front"]).toEqual(["/labels/front"]);
    expect(read.referenceGrid).toEqual(DEFAULT_MCAP_REFERENCE_GRID);
    expect(read.sceneBackground).toEqual(DEFAULT_MCAP_SCENE_BACKGROUND);
  });

  it("migrates v1 payloads with any interpolation opt-out to as-recorded", () => {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        version: 1,
        imageLabelTopics: {},
        interpolate2dAnnotations: false,
        interpolate3dAnnotations: true,
        temporalPolicy: DEFAULT_MCAP_TEMPORAL_POLICY,
      }),
    );

    expect(readMcapModalSettings().fidelityMode).toBe("as-recorded");
  });

  it("clamps invalid reference-grid values", () => {
    writeMcapModalSettings({
      version: 2,
      fidelityMode: DEFAULT_MCAP_FIDELITY_MODE,
      imageLabelTopics: {},
      referenceGrid: {
        enabled: true,
        opacityPercent: 250,
        spacingM: Number.NaN,
      },
      sceneBackground: DEFAULT_MCAP_SCENE_BACKGROUND,
      temporalPolicy: DEFAULT_MCAP_TEMPORAL_POLICY,
    });

    expect(readMcapModalSettings().referenceGrid).toEqual({
      enabled: true,
      opacityPercent: 100,
      spacingM: DEFAULT_MCAP_REFERENCE_GRID.spacingM,
    });
  });

  it("rejects invalid scene background values", () => {
    writeMcapModalSettings({
      version: 2,
      fidelityMode: DEFAULT_MCAP_FIDELITY_MODE,
      imageLabelTopics: {},
      referenceGrid: DEFAULT_MCAP_REFERENCE_GRID,
      sceneBackground: {
        mode: "plaid" as never,
        solidColor: "not-a-color",
      },
      temporalPolicy: DEFAULT_MCAP_TEMPORAL_POLICY,
    });

    expect(readMcapModalSettings().sceneBackground).toEqual(
      DEFAULT_MCAP_SCENE_BACKGROUND,
    );
  });

  it("preserves explicit empty label selections", () => {
    writeMcapModalSettings({
      version: 2,
      fidelityMode: DEFAULT_MCAP_FIDELITY_MODE,
      imageLabelTopics: {
        "/camera/front": [],
      },
      referenceGrid: DEFAULT_MCAP_REFERENCE_GRID,
      sceneBackground: DEFAULT_MCAP_SCENE_BACKGROUND,
      temporalPolicy: DEFAULT_MCAP_TEMPORAL_POLICY,
    });

    const read = readMcapModalSettings();
    expect(Object.hasOwn(read.imageLabelTopics, "/camera/front")).toBe(true);
    expect(read.imageLabelTopics["/camera/front"]).toEqual([]);
  });

  it("updates settings through the provider hook", () => {
    const { result } = renderHook(() => useMcapModalSettings(), {
      wrapper: ({ children }: { children: React.ReactNode }) => (
        <McapModalSettingsProvider>{children}</McapModalSettingsProvider>
      ),
    });

    act(() => {
      result.current.setFidelityMode("as-recorded");
      result.current.setReferenceGrid({ enabled: false, spacingM: 10 });
      result.current.setSceneBackground({ mode: "studio" });
      result.current.setImageLabelTopics("/camera/front", ["/labels"]);
      result.current.setTemporalPolicy({
        boundaryClampMs: 75,
        maxInterpolationGapMs: 125,
        staleMediaWarningMs: 500,
        transformGapWarningMs: 1500,
      });
    });

    expect(result.current.fidelityMode).toBe("as-recorded");
    expect(result.current.referenceGrid).toEqual({
      enabled: false,
      opacityPercent: DEFAULT_MCAP_REFERENCE_GRID.opacityPercent,
      spacingM: 10,
    });
    expect(result.current.sceneBackground).toEqual({
      mode: "studio",
      solidColor: DEFAULT_MCAP_SCENE_BACKGROUND.solidColor,
    });
    expect(result.current.imageLabelTopics["/camera/front"]).toEqual([
      "/labels",
    ]);
    expect(result.current.temporalPolicy).toEqual({
      boundaryClampMs: 75,
      maxInterpolationGapMs: 125,
      staleMediaWarningMs: 500,
      transformGapWarningMs: 1500,
    });
    expect(readMcapModalSettings()).toMatchObject({
      fidelityMode: "as-recorded",
      imageLabelTopics: { "/camera/front": ["/labels"] },
      referenceGrid: {
        enabled: false,
        opacityPercent: DEFAULT_MCAP_REFERENCE_GRID.opacityPercent,
        spacingM: 10,
      },
      sceneBackground: {
        mode: "studio",
        solidColor: DEFAULT_MCAP_SCENE_BACKGROUND.solidColor,
      },
      temporalPolicy: {
        boundaryClampMs: 75,
        maxInterpolationGapMs: 125,
        staleMediaWarningMs: 500,
        transformGapWarningMs: 1500,
      },
    });

    act(() => {
      result.current.resetTemporalPolicy();
    });

    expect(result.current.temporalPolicy).toEqual(DEFAULT_MCAP_TEMPORAL_POLICY);
  });

  it("clamps invalid temporal policy values", () => {
    writeMcapModalSettings({
      version: 2,
      fidelityMode: DEFAULT_MCAP_FIDELITY_MODE,
      imageLabelTopics: {},
      referenceGrid: DEFAULT_MCAP_REFERENCE_GRID,
      sceneBackground: DEFAULT_MCAP_SCENE_BACKGROUND,
      temporalPolicy: {
        boundaryClampMs: -10,
        maxInterpolationGapMs: 100_000,
        staleMediaWarningMs: Number.NaN,
        transformGapWarningMs: Number.POSITIVE_INFINITY,
      },
    });

    expect(readMcapModalSettings()).toMatchObject({
      temporalPolicy: {
        boundaryClampMs: 0,
        maxInterpolationGapMs: 60_000,
        staleMediaWarningMs: DEFAULT_MCAP_TEMPORAL_POLICY.staleMediaWarningMs,
        transformGapWarningMs:
          DEFAULT_MCAP_TEMPORAL_POLICY.transformGapWarningMs,
      },
    });
  });
});
