/**
 * Copyright 2017-2026, Voxel51, Inc.
 * @vitest-environment jsdom
 */

/**
 * Which surface the modal mounts for an ordered dynamic group viewed as a
 * video: the Lighter timeline surface by default for an image dataset's group
 * in Explore, the legacy ImaVid looker behind the opt-out and in Annotate.
 */

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mockState = vi.hoisted(() => ({
  modalMode: "EXPLORE",
  lighterDynamicGroupVideo: true,
  values: {
    shouldRenderImaVidLooker: true,
    selectedMediaField: "filepath",
  } as Record<string, unknown>,
  media: {
    nativeLookerType: "image" as string | null,
    selectedMediaPath: "/tmp/a.png",
  },
}));

vi.mock("@fiftyone/state", () => ({
  ModalMode: { ANNOTATE: "ANNOTATE", EXPLORE: "EXPLORE" },
  modalMode: { key: "modalMode" },
  modalSample: { key: "modalSample" },
  selectedLabels: { key: "selectedLabels" },
  showOverlays: { key: "showOverlays" },
  shouldRenderImaVidLooker: () => ({ key: "shouldRenderImaVidLooker" }),
  selectedMediaField: () => ({ key: "selectedMediaField" }),
  getNormalizedUrls: (urls: unknown) => urls ?? {},
  resolveMediaFieldLooker: () => mockState.media,
  useReportAnnotationSurface: () => undefined,
  useLighterDynamicGroupVideo: () => mockState.lighterDynamicGroupVideo,
}));

vi.mock("jotai", () => ({
  useAtomValue: () => mockState.modalMode,
}));

vi.mock("recoil", async () => {
  const actual = await vi.importActual<typeof import("recoil")>("recoil");
  return {
    ...actual,
    useRecoilValue: (node: { key: string }) => {
      if (!(node.key in mockState.values)) {
        throw new Error(`Unexpected recoil value: ${node.key}`);
      }
      return mockState.values[node.key];
    },
    useRecoilCallback: () => () => undefined,
  };
});

vi.mock("@fiftyone/components", () => ({
  useTheme: () => ({ background: { level2: "#000" } }),
}));

vi.mock("@fiftyone/video-annotation", () => ({
  VideoAnnotationSurface: () => <div>video-annotation-surface</div>,
}));

vi.mock("./ImaVidLooker", () => ({
  ImaVidLookerReact: () => <div>imavid-looker</div>,
}));

vi.mock("./DynamicGroupVideoTimelineSurface", () => ({
  DynamicGroupVideoTimelineSurface: () => <div>dgva-lighter-surface</div>,
}));

vi.mock("./VideoTimelineSurface", () => ({
  VideoTimelineSurface: () => <div>video-timeline-surface</div>,
}));

vi.mock("./Lighter/LighterSampleRenderer", () => ({
  LighterSampleRenderer: () => <div>lighter-image</div>,
}));

vi.mock("./ModalSampleRenderer", () => ({
  ModalSampleRenderer: () => <div>custom-renderer</div>,
}));

vi.mock("./use-looker", () => ({
  default: () => ({ id: "looker", ref: { current: null }, looker: null }),
}));

vi.mock("./use-modal-selective-rendering", () => ({
  useImageModalSelectiveRendering: () => undefined,
}));

import { ModalLooker } from "./ModalLooker";

const sample = {
  sample: { _id: "s", id: "s", filepath: "/tmp/a.png" },
  urls: [{ field: "filepath", url: "/media/a.png" }],
} as never;

describe("ModalLooker dynamic group video routing", () => {
  afterEach(cleanup);

  beforeEach(() => {
    mockState.modalMode = "EXPLORE";
    mockState.lighterDynamicGroupVideo = true;
    mockState.values = {
      shouldRenderImaVidLooker: true,
      selectedMediaField: "filepath",
    };
    mockState.media = {
      nativeLookerType: "image",
      selectedMediaPath: "/tmp/a.png",
    };
  });

  it("mounts the Lighter timeline surface for an image dynamic group in Explore", () => {
    render(<ModalLooker sample={sample} />);
    expect(screen.getByText("dgva-lighter-surface")).toBeTruthy();
    expect(screen.queryByText("imavid-looker")).toBeNull();
  });

  it("falls back to the ImaVid looker when the legacy opt-out is set", () => {
    mockState.lighterDynamicGroupVideo = false;
    render(<ModalLooker sample={sample} />);
    expect(screen.getByText("imavid-looker")).toBeTruthy();
    expect(screen.queryByText("dgva-lighter-surface")).toBeNull();
  });

  it("keeps the ImaVid looker for the video view mode in Annotate", () => {
    mockState.modalMode = "ANNOTATE";
    render(<ModalLooker sample={sample} />);
    expect(screen.getByText("imavid-looker")).toBeTruthy();
    expect(screen.queryByText("dgva-lighter-surface")).toBeNull();
  });

  it("leaves a real video sample on the video timeline surface", () => {
    mockState.values.shouldRenderImaVidLooker = false;
    mockState.lighterDynamicGroupVideo = false;
    mockState.media = {
      nativeLookerType: "video",
      selectedMediaPath: "/v.mp4",
    };
    render(<ModalLooker sample={sample} />);
    expect(screen.getByText("video-timeline-surface")).toBeTruthy();
  });
});
