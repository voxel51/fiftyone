import { act, cleanup, renderHook } from "@testing-library/react";
import React from "react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
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
    });

    expect(readMcapModalSettings()).toEqual({
      version: 1,
      imageLabelTopics: {
        "/camera/front": ["/labels/front", "/labels/all"],
      },
      interpolate2dAnnotations: false,
      interpolate3dAnnotations: true,
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
    });

    expect(result.current.interpolate2dAnnotations).toBe(false);
    expect(result.current.interpolate3dAnnotations).toBe(false);
    expect(result.current.imageLabelTopics["/camera/front"]).toEqual([
      "/labels",
    ]);
    expect(readMcapModalSettings()).toMatchObject({
      imageLabelTopics: { "/camera/front": ["/labels"] },
      interpolate2dAnnotations: false,
      interpolate3dAnnotations: false,
    });
  });
});
