import {
  FrameLooker,
  ImageLooker,
  VideoLooker,
  selectiveRenderingEventBus,
} from "@fiftyone/looker";
import { cleanup, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const env = vi.hoisted(() => ({
  isFrame: false,
  isClip: false,
  dynamic: false,
  selected: new Map<string, boolean>(),
  options: {} as Record<string, unknown>,
  listener: vi.fn(),
  error: vi.fn(),
  config: {} as Record<string, unknown>,
}));

vi.mock("@fiftyone/looker", () => {
  class Looker {
    constructor(
      _sample: unknown,
      config: Record<string, unknown>,
      options: Record<string, unknown>,
    ) {
      env.config = config;
      env.options = options;
    }
    addEventListener = env.listener;
  }
  class FrameLooker extends Looker {}
  class VideoLooker extends Looker {}
  class ImageLooker extends Looker {}
  class ImaVidLooker extends Looker {}
  return {
    FrameLooker,
    VideoLooker,
    ImageLooker,
    MetadataLooker: Looker,
    ThreeDLooker: Looker,
    ImaVidLooker,
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
vi.mock("react-error-boundary", () => ({ useErrorHandler: () => env.error }));
vi.mock("recoil", () => ({
  useRecoilValue: (key: string) => {
    if (key === "frame") return env.isFrame;
    if (key === "clip") return env.isClip;
    if (key === "dynamic-group" || key === "imavid") return env.dynamic;
    if (key === "selected") return env.selected;
    if (key === "media") return "filepath";
    if (key === "schema") return {};
    if (key === "view") return [{ _cls: "current-stage" }];
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
vi.mock("../recoil/schema", () => ({
  fieldSchema: () => "schema",
  lookerFieldSchema: () => "schema",
}));
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
  vi.clearAllMocks();
  env.isFrame = false;
  env.isClip = false;
  env.dynamic = false;
  env.selected.clear();
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

describe("captured previews", () => {
  it("uses the captured native sample instead of the current frame/clip/group view", () => {
    env.isFrame = true;
    env.isClip = true;
    env.dynamic = true;
    env.selected.set("frame-3", true);
    const preview = { onError: vi.fn(), posterSeconds: 2.5 };
    const { result } = renderHook(() => useCreateLooker(false, true, {}));
    expect(
      result.current.current(
        { ...SAMPLE, sample: { ...SAMPLE.sample, support: [10, 20] } },
        {},
        preview,
      ),
    ).toBeInstanceOf(VideoLooker);
    expect(env.config).toEqual(
      expect.objectContaining({
        view: [],
        isDynamicGroup: false,
        support: undefined,
        frameNumber: undefined,
        posterSeconds: 2.5,
      }),
    );
    expect(env.options.selected).toBe(false);
    expect(selectiveRenderingEventBus.on).not.toHaveBeenCalled();
    const [, onError] = env.listener.mock.calls[0];
    const error = new Error("renderer failed");
    onError({ error });
    expect(preview.onError).toHaveBeenCalledWith(error);
    expect(env.error).not.toHaveBeenCalled();
  });

  it("keeps images out of the current dynamic group's ImaVid controller", () => {
    env.dynamic = true;
    const { result } = renderHook(() => useCreateLooker(false, true, {}));
    const image = {
      sample: {
        _id: "image",
        filepath: "/image.jpg",
        metadata: { mime_type: "image/jpeg" },
      },
      urls: { filepath: "/image.jpg" },
    };
    expect(
      result.current.current(image, {}, { onError: vi.fn() }),
    ).toBeInstanceOf(ImageLooker);
    expect(env.config.isDynamicGroup).toBe(false);
  });
});
