import type * as fos from "@fiftyone/state";
import { cleanup, render, screen } from "@testing-library/react";
import { createRef } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

const media = vi.hoisted(() => ({ frames: false, type: "video" }));

vi.mock("@fiftyone/state", () => ({
  modalMode: "mode",
  ModalMode: { ANNOTATE: "annotate" },
  shouldRenderImaVidLooker: () => "imavid",
  selectedMediaField: () => "filepath",
  resolveMediaFieldLooker: () => ({ nativeLookerType: media.type }),
  getNormalizedUrls: () => ({}),
  useIsFramesView: () => media.frames,
  useReportAnnotationSurface: () => undefined,
}));
vi.mock("recoil", () => ({
  useRecoilValue: () => false,
  useRecoilCallback: () => vi.fn(),
}));
vi.mock("jotai", () => ({ useAtomValue: () => "explore" }));
vi.mock("@fiftyone/video-annotation", () => ({
  VideoAnnotationSurface: () => null,
}));
vi.mock("./VideoLookerSurface", () => ({
  VideoLookerSurface: () => <div data-testid="video-timeline" />,
}));
vi.mock("./ImaVidLooker", () => ({ ImaVidLookerReact: () => null }));
vi.mock("./Lighter/LighterSampleRenderer", () => ({
  LighterSampleRenderer: () => null,
}));
vi.mock("./ModalSampleRenderer", () => ({ ModalSampleRenderer: () => null }));
vi.mock("./use-looker", () => ({
  default: () => ({ id: "native-looker", ref: createRef(), looker: {} }),
}));
vi.mock("./use-modal-selective-rendering", () => ({
  useImageModalSelectiveRendering: () => undefined,
}));

import { ModalLooker } from "./ModalLooker";

const SAMPLE = {
  sample: { _id: "frame-1", filepath: "/video.mp4", frame_number: 3 },
  urls: [],
} as unknown as fos.ModalSample;

afterEach(() => {
  cleanup();
  media.frames = false;
  media.type = "video";
});

describe("native modal surfaces", () => {
  it("shows a frozen frame without requesting a video timeline", () => {
    media.frames = true;
    render(<ModalLooker sample={SAMPLE} />);
    expect(screen.queryByTestId("video-timeline")).toBeNull();
    expect(
      document.querySelector('[data-cy="modal-looker-container"]'),
    ).not.toBeNull();
  });

  it("keeps the timeline for a video sample", () => {
    render(<ModalLooker sample={SAMPLE} />);
    expect(screen.queryByTestId("video-timeline")).not.toBeNull();
    expect(
      document.querySelector('[data-cy="modal-looker-container"]'),
    ).toBeNull();
  });

  it("keeps an image-backed frame on the native frame surface", () => {
    media.frames = true;
    media.type = "image";
    render(<ModalLooker sample={SAMPLE} />);
    expect(screen.queryByTestId("video-timeline")).toBeNull();
    expect(
      document.querySelector('[data-cy="modal-looker-container"]'),
    ).not.toBeNull();
  });
});
