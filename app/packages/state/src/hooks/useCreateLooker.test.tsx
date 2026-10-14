import { FrameLooker, VideoLooker } from "@fiftyone/looker";
import { cleanup, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const env = vi.hoisted(() => ({
  isFrame: false,
  config: {} as Record<string, unknown>,
}));

vi.mock("@fiftyone/looker", () => {
  class Looker {
    constructor(_sample: unknown, config: Record<string, unknown>) {
      env.config = config;
    }
    addEventListener() {}
  }
  class FrameLooker extends Looker {}
  class VideoLooker extends Looker {}
  return {
    FrameLooker,
    VideoLooker,
    ImageLooker: Looker,
    MetadataLooker: Looker,
    ThreeDLooker: Looker,
    ImaVidLooker: Looker,
    FO_LABEL_TOGGLED_EVENT: "label-toggled",
    selectiveRenderingEventBus: { on: vi.fn() },
  };
});
vi.mock("@fiftyone/looker/src/lookers/imavid/controller", () => ({
  ImaVidFramesController: vi.fn(),
}));
vi.mock("@fiftyone/looker/src/lookers/imavid/store", () => ({
  ImaVidFramesControllerStore: {},
}));
vi.mock("react-relay", () => ({ useRelayEnvironment: () => ({}) }));
vi.mock("react-error-boundary", () => ({ useErrorHandler: () => vi.fn() }));
vi.mock("recoil", () => ({
  useRecoilValue: (key: string) => {
    if (key === "frame") return env.isFrame;
    if (key === "selected") return new Map();
    if (key === "media") return "filepath";
    if (key === "schema") return {};
    if (key === "view") return [];
    if (key === "dataset") return "video-dataset";
    return false;
  },
  useRecoilCallback: (
    factory: (context: {
      snapshot: { getPromise: () => Promise<null> };
    }) => unknown,
  ) => factory({ snapshot: { getPromise: async () => null } }),
}));
vi.mock("../recoil", () => ({
  dynamicGroupsElementCount: vi.fn(),
  selectedMediaField: () => "media",
}));
vi.mock("../recoil/atoms", () => ({
  sampleSelectionStyle: "style",
  selectedSamples: "selected",
}));
vi.mock("../recoil/view", () => ({
  isClipsView: "clip",
  isFramesView: "frame",
  isPatchesView: "patch",
  view: "view",
}));
vi.mock("../recoil/dynamicGroups", () => ({
  shouldRenderImaVidLooker: () => "imavid",
  isDynamicGroup: "dynamic-group",
}));
vi.mock("../recoil/schema", () => ({ fieldSchema: () => "schema" }));
vi.mock("../recoil/selectors", () => ({
  datasetName: "dataset",
  dynamicGroupsTargetFrameRate: "frame-rate",
}));
vi.mock("../recoil/utils", () => ({
  getSampleSrc: (path: string) => path,
  resolveSelectionIcon: () => ({}),
}));
vi.mock("./useOnShiftClickLabel", () => ({
  useOnShiftClickLabel: () => vi.fn(),
}));

import useCreateLooker from "./useCreateLooker";

const SAMPLE = {
  sample: {
    _id: "frame-3",
    filepath: "/video.mp4",
    frame_number: 3,
    metadata: { mime_type: "video/mp4" },
  },
  urls: { filepath: "/media?filepath=/video.mp4" },
};

afterEach(() => {
  cleanup();
  env.isFrame = false;
  env.config = {};
});

describe("video-backed lookers", () => {
  it("uses a FrameLooker at the represented frame", () => {
    env.isFrame = true;
    const { result } = renderHook(() => useCreateLooker(true, false, {}));
    expect(result.current.current(SAMPLE)).toBeInstanceOf(FrameLooker);
    expect(env.config.frameNumber).toBe(3);
  });

  it("preserves an explicitly resolved frame number", () => {
    env.isFrame = true;
    const { result } = renderHook(() => useCreateLooker(true, false, {}));
    result.current.current({ ...SAMPLE, frameNumber: 5 });
    expect(env.config.frameNumber).toBe(5);
  });

  it("keeps ordinary videos on the streaming VideoLooker", () => {
    const { result } = renderHook(() => useCreateLooker(true, false, {}));
    expect(result.current.current(SAMPLE)).toBeInstanceOf(VideoLooker);
    expect(env.config.frameNumber).toBeUndefined();
  });
});
