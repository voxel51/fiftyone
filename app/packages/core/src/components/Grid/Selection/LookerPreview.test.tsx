import { act, cleanup, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import LookerPreview from "./LookerPreview";

const mocks = vi.hoisted(() => {
  class VideoLooker {
    state = { dimensions: [1600, 800], error: false };
    loaded = false;
    duration = 12;
    attach = vi.fn();
    destroy = vi.fn();
    resize = vi.fn();
    updateOptions = vi.fn();
    posterAt = vi.fn();
    unsubscribe = vi.fn();
    addEventListener =
      vi.fn<
        (
          _name: string,
          _callback: () => void,
          _options?: AddEventListenerOptions,
        ) => void
      >();
    subscribeToState = vi.fn(
      (_field: string, _callback: (value: unknown) => void) => this.unsubscribe,
    );
  }
  return {
    VideoLooker,
    instance: new VideoLooker(),
    options: { activePaths: ["ground_truth"], mediaFallback: false },
    mediaField: "filepath",
  };
});
const createLooker = vi.hoisted(() => ({ current: vi.fn() }));

vi.mock("@fiftyone/looker", () => ({ VideoLooker: mocks.VideoLooker }));
vi.mock("@fiftyone/state", async () => {
  const { resolveMediaFieldLooker } =
    await import("@fiftyone/state/src/hooks/media-field-lookers");
  const { getNormalizedUrls } = await import("@fiftyone/state/src/utils");
  return {
    useLookerOptions: () => mocks.options,
    useSelectedMediaFieldGrid: () => mocks.mediaField,
    useCreateLooker: () => createLooker,
    resolveMediaFieldLooker,
    getNormalizedUrls,
  };
});

const node = {
  id: "sample",
  sample: {
    _id: "sample",
    filepath: "/video.mp4",
    metadata: { frame_rate: 24 },
  },
  urls: [{ field: "filepath", url: "/video.mp4" }],
};

function load() {
  mocks.instance.loaded = true;
  const callback = mocks.instance.addEventListener.mock.calls.find(
    ([name]) => name === "load",
  )?.[1];
  act(() => callback?.());
}

afterEach(cleanup);
beforeEach(() => {
  vi.clearAllMocks();
  mocks.instance = new mocks.VideoLooker();
  createLooker.current.mockReturnValue(mocks.instance);
  mocks.options = { activePaths: ["ground_truth"], mediaFallback: false };
  mocks.mediaField = "filepath";
});

describe("LookerPreview", () => {
  it("shows only media, disables interaction, and releases all resources", () => {
    const { container, unmount } = render(
      <LookerPreview node={node} width={106} />,
    );
    const [sample] = createLooker.current.mock.calls[0];
    expect(sample).toEqual(expect.objectContaining({ ...node, frameRate: 24 }));
    const host = container.querySelector("[inert]");
    expect(host).toBeTruthy();
    expect(mocks.instance.attach).toHaveBeenCalledWith(host);
    expect(mocks.instance.updateOptions).toHaveBeenCalledWith(
      expect.objectContaining({
        activePaths: [],
        showOverlays: false,
        showPatchLabels: false,
        selected: false,
        inSelectionMode: false,
        shouldHandleKeyEvents: false,
        showControls: false,
      }),
      true,
    );
    expect(mocks.instance.resize).toHaveBeenCalledWith([106, 106]);
    unmount();
    expect(mocks.instance.unsubscribe).toHaveBeenCalledOnce();
    expect(mocks.instance.destroy).toHaveBeenCalledOnce();
  });

  it.each([{ frameRate: 12 }, { frame_rate: 15 }])(
    "uses resolved video timing from either node source: %s",
    (timing) => {
      render(<LookerPreview node={{ ...node, ...timing }} width={106} />);
      expect(createLooker.current.mock.calls[0][0].frameRate).toBe(
        Object.values(timing)[0],
      );
    },
  );

  it("keeps labels hidden when grid options change and resizes without recreating the looker", () => {
    const { rerender } = render(<LookerPreview node={node} width={106} />);
    mocks.options = { ...mocks.options, activePaths: [] };
    rerender(<LookerPreview node={node} width={208} height={206} />);
    expect(createLooker.current).toHaveBeenCalledOnce();
    expect(mocks.instance.updateOptions).toHaveBeenLastCalledWith(
      expect.objectContaining({ activePaths: [], showOverlays: false }),
      true,
    );
    expect(mocks.instance.resize).toHaveBeenLastCalledWith([208, 206]);
  });

  it.each([16 / 9, 9 / 16, 4, 0.25])(
    "preserves a source aspect of %s inside a bounded preview",
    (sourceAspect) => {
      const { container } = render(
        <LookerPreview
          node={node}
          width={200}
          height={100}
          sourceAspect={sourceAspect}
        />,
      );
      const [width, height] = mocks.instance.resize.mock.lastCall![0];
      expect(width / height).toBeCloseTo(sourceAspect);
      expect(width).toBeLessThanOrEqual(200);
      expect(height).toBeLessThanOrEqual(100);
      const wrapper = container.firstChild as HTMLElement;
      expect(parseFloat(wrapper.style.width)).toBeCloseTo(width);
      expect(parseFloat(wrapper.style.height)).toBeCloseTo(height);
    },
  );

  it("replaces the looker when the selected media field or fallback changes", () => {
    const { rerender } = render(<LookerPreview node={node} width={106} />);
    mocks.mediaField = "thumbnail";
    rerender(<LookerPreview node={node} width={106} />);
    expect(mocks.instance.destroy).toHaveBeenCalledOnce();
    mocks.options = { ...mocks.options, mediaFallback: true };
    rerender(<LookerPreview node={node} width={106} />);
    expect(mocks.instance.destroy).toHaveBeenCalledTimes(2);
    expect(createLooker.current).toHaveBeenCalledTimes(3);
  });

  it("starts the first poster at the captured time and applies subsequent changes", () => {
    const onMetadata = vi.fn();
    const { rerender } = render(
      <LookerPreview
        node={node}
        width={106}
        previewStart={2.5}
        onMetadata={onMetadata}
      />,
    );
    expect(mocks.instance.posterAt).not.toHaveBeenCalled();
    expect(createLooker.current.mock.calls[0][2].posterSeconds).toBe(2.5);
    load();
    expect(mocks.instance.posterAt).not.toHaveBeenCalled();
    expect(onMetadata).toHaveBeenCalledWith({ aspectRatio: 2, duration: 12 });
    rerender(
      <LookerPreview
        node={node}
        width={106}
        previewStart={6}
        onMetadata={onMetadata}
      />,
    );
    expect(mocks.instance.posterAt).toHaveBeenLastCalledWith(6);
    rerender(<LookerPreview node={node} width={106} />);
    expect(mocks.instance.posterAt).toHaveBeenLastCalledWith(null);
    expect(createLooker.current).toHaveBeenCalledOnce();
  });

  it("does not replace known dimensions or seek again after a load error", () => {
    const onMetadata = vi.fn();
    render(
      <LookerPreview
        node={node}
        width={106}
        previewStart={2}
        onMetadata={onMetadata}
      />,
    );
    mocks.instance.state.error = true;
    mocks.instance.state.dimensions = [512, 512];
    load();
    expect(onMetadata).not.toHaveBeenCalled();
    expect(mocks.instance.posterAt).not.toHaveBeenCalled();
  });

  it("retains media across filtered-label validation but replaces a changed source", () => {
    const { rerender } = render(<LookerPreview node={node} width={106} />);
    const refreshed = {
      ...node,
      sample: {
        ...node.sample,
        ground_truth: { _cls: "Detections", detections: [] },
      },
      urls: [...node.urls, { field: "mask.filepath", url: "/mask.png" }],
    };
    rerender(<LookerPreview node={refreshed} width={106} />);
    expect(createLooker.current).toHaveBeenCalledOnce();
    expect(mocks.instance.destroy).not.toHaveBeenCalled();
    rerender(
      <LookerPreview
        node={{
          ...refreshed,
          urls: [{ field: "filepath", url: "/renewed.mp4" }],
        }}
        width={106}
      />,
    );
    expect(createLooker.current).toHaveBeenCalledTimes(2);
    expect(mocks.instance.destroy).toHaveBeenCalledOnce();
  });

  it("uses the latest start time if it changes before load", () => {
    const { rerender } = render(
      <LookerPreview node={node} width={106} previewStart={2} />,
    );
    rerender(<LookerPreview node={node} width={106} previewStart={4} />);
    load();
    expect(mocks.instance.posterAt).toHaveBeenCalledExactlyOnceWith(4);
  });

  it("fits and centers a crop without enlarging the canvas, including after resize", () => {
    const crop = [0.1, 0.2, 0.2, 0.4] as const;
    const { rerender } = render(
      <LookerPreview
        node={node}
        width={100}
        height={100}
        crop={crop}
        sourceAspect={2}
      />,
    );
    expect(mocks.instance.updateOptions).toHaveBeenLastCalledWith(
      expect.objectContaining({
        zoom: false,
        initialViewport: { scale: 5, panX: -50, panY: -175 },
      }),
      true,
    );
    expect(mocks.instance.resize).toHaveBeenLastCalledWith([100, 100]);
    rerender(
      <LookerPreview
        node={node}
        width={200}
        height={200}
        crop={crop}
        sourceAspect={2}
      />,
    );
    expect(mocks.instance.updateOptions).toHaveBeenLastCalledWith(
      expect.objectContaining({
        initialViewport: { scale: 5, panX: -100, panY: -350 },
      }),
      true,
    );
    expect(mocks.instance.resize).toHaveBeenLastCalledWith([200, 200]);
    expect(createLooker.current).toHaveBeenCalledOnce();
  });

  it("letterboxes wide crops and clears the viewport for an uncropped image", () => {
    const { container, rerender } = render(
      <LookerPreview
        node={node}
        width={300}
        height={100}
        crop={[0.5, 0.1, 0.4, 0.2]}
        sourceAspect={2}
      />,
    );
    expect(mocks.instance.resize).toHaveBeenLastCalledWith([300, 75]);
    expect((container.firstChild as HTMLElement).style.height).toBe("75px");
    rerender(<LookerPreview node={node} width={300} height={100} />);
    expect(mocks.instance.updateOptions).toHaveBeenLastCalledWith(
      expect.objectContaining({ initialViewport: null, zoom: false }),
      true,
    );
  });

  it("keeps media and renderer errors local to the preview", () => {
    const onError = vi.fn();
    render(<LookerPreview node={node} width={106} onError={onError} />);
    const callback = mocks.instance.subscribeToState.mock.calls[0][1];
    act(() => callback(true));
    expect(onError).toHaveBeenCalledOnce();
    act(() =>
      createLooker.current.mock.calls[0][2].onError(new Error("failed")),
    );
    expect(onError).toHaveBeenCalledTimes(2);
  });
});
