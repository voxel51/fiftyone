import { act, cleanup, renderHook } from "@testing-library/react";
import React from "react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  DEFAULT_MCAP_TEMPORAL_POLICY,
  McapModalSettingsProvider,
  readMcapModalSettings,
  useMcapModalSettings,
  writeMcapModalSettings,
} from "./mcap-modal-settings";

describe("mcap-modal-settings", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => cleanup());

  it("returns default interpolation settings when nothing is stored", () => {
    expect(readMcapModalSettings()).toEqual({
      version: 1,
      imageLabelTopics: {},
      interpolate2dAnnotations: true,
      interpolate3dAnnotations: true,
      temporalPolicy: DEFAULT_MCAP_TEMPORAL_POLICY,
    });
  });

  it("round-trips global interpolation settings and image label topics", () => {
    writeMcapModalSettings({
      version: 1,
      imageLabelTopics: {
        "/camera/front": ["/labels/front", "/labels/all"],
      },
      interpolate2dAnnotations: false,
      interpolate3dAnnotations: true,
      temporalPolicy: {
        boundaryClampMs: 0,
        maxInterpolationGapMs: 500,
        staleMediaWarningMs: 250,
        transformGapWarningMs: 1500,
      },
    });

    expect(readMcapModalSettings()).toEqual({
      version: 1,
      imageLabelTopics: {
        "/camera/front": ["/labels/front", "/labels/all"],
      },
      interpolate2dAnnotations: false,
      interpolate3dAnnotations: true,
      temporalPolicy: {
        boundaryClampMs: 0,
        maxInterpolationGapMs: 500,
        staleMediaWarningMs: 250,
        transformGapWarningMs: 1500,
      },
    });
  });

  it("preserves explicit empty label selections", () => {
    writeMcapModalSettings({
      version: 1,
      imageLabelTopics: {
        "/camera/front": [],
      },
      interpolate2dAnnotations: true,
      interpolate3dAnnotations: true,
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
      result.current.setInterpolate2dAnnotations(false);
      result.current.setInterpolate3dAnnotations(false);
      result.current.setImageLabelTopics("/camera/front", ["/labels"]);
      result.current.setTemporalPolicy({
        boundaryClampMs: 75,
        maxInterpolationGapMs: 125,
        staleMediaWarningMs: 500,
        transformGapWarningMs: 1500,
      });
    });

    expect(result.current.interpolate2dAnnotations).toBe(false);
    expect(result.current.interpolate3dAnnotations).toBe(false);
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
      imageLabelTopics: { "/camera/front": ["/labels"] },
      interpolate2dAnnotations: false,
      interpolate3dAnnotations: false,
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
      version: 1,
      imageLabelTopics: {},
      interpolate2dAnnotations: true,
      interpolate3dAnnotations: true,
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
