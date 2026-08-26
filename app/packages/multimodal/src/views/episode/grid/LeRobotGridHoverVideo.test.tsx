import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { EpisodePreviewNativeVideo } from "../../../ir";
import { LeRobotGridHoverVideo } from "./LeRobotGridHoverVideo";
import { resetGridNativeVideoLeasesForTests } from "./grid-native-video-lease";

type FrameCallback = (
  now: number,
  metadata: { readonly mediaTime: number },
) => void;

const frameHarness = {
  callbacks: new Map<number, FrameCallback>(),
  nextHandle: 1,
};

beforeEach(() => {
  resetGridNativeVideoLeasesForTests();
  frameHarness.callbacks.clear();
  frameHarness.nextHandle = 1;
  Object.defineProperty(
    HTMLVideoElement.prototype,
    "requestVideoFrameCallback",
    {
      configurable: true,
      value: vi.fn((callback: FrameCallback) => {
        const handle = frameHarness.nextHandle++;
        frameHarness.callbacks.set(handle, callback);
        return handle;
      }),
    },
  );
  Object.defineProperty(
    HTMLVideoElement.prototype,
    "cancelVideoFrameCallback",
    {
      configurable: true,
      value: vi.fn((handle: number) => {
        frameHarness.callbacks.delete(handle);
      }),
    },
  );
  vi.spyOn(HTMLMediaElement.prototype, "load").mockImplementation(
    () => undefined,
  );
  vi.spyOn(HTMLMediaElement.prototype, "pause").mockImplementation(
    () => undefined,
  );
  vi.spyOn(HTMLMediaElement.prototype, "play").mockResolvedValue(undefined);
  Object.defineProperty(HTMLVideoElement.prototype, "videoWidth", {
    configurable: true,
    get: () => 320,
  });
  Object.defineProperty(HTMLVideoElement.prototype, "videoHeight", {
    configurable: true,
    get: () => 180,
  });
});

afterEach(() => {
  cleanup();
  resetGridNativeVideoLeasesForTests();
  vi.restoreAllMocks();
});

describe("LeRobotGridHoverVideo", () => {
  it("maps hover playback onto the asset interval before revealing video", () => {
    render(
      <>
        <div data-testid="cached-poster" />
        <LeRobotGridHoverVideo video={nativeVideo(14.2, 37.533333)} />
      </>,
    );
    const element = screen.getByTestId(
      "lerobot-grid-hover-video",
    ) as HTMLVideoElement;

    expect(element.muted).toBe(true);
    expect(element.playsInline).toBe(true);
    expect(element.preload).toBe("metadata");
    expect(element.getAttribute("src")).toContain("/asset/video.mp4");
    expect(element.style.visibility).not.toBe("visible");

    fireEvent.loadedMetadata(element);
    expect(element.currentTime).toBe(14.2);
    expect(HTMLMediaElement.prototype.play).toHaveBeenCalledOnce();
    expect(screen.getByTestId("cached-poster")).toBeTruthy();
    expect(element.style.visibility).not.toBe("visible");

    presentFrame(14.1995);
    expect(element.style.visibility).toBe("visible");
    expect(screen.getByTestId("cached-poster")).toBeTruthy();
  });

  it("hides and loops before presenting the adjacent episode", () => {
    render(<LeRobotGridHoverVideo video={nativeVideo(10, 12)} />);
    const element = screen.getByTestId(
      "lerobot-grid-hover-video",
    ) as HTMLVideoElement;
    fireEvent.loadedMetadata(element);
    presentFrame(11.9);
    expect(element.style.visibility).toBe("visible");

    presentFrame(12);
    expect(element.currentTime).toBe(10);
    expect(element.style.visibility).not.toBe("visible");
    expect(HTMLMediaElement.prototype.play).toHaveBeenCalledTimes(2);

    presentFrame(10);
    expect(element.style.visibility).toBe("visible");
  });

  it("uses media events when presented-frame callbacks are unavailable", () => {
    Object.defineProperty(
      HTMLVideoElement.prototype,
      "requestVideoFrameCallback",
      { configurable: true, value: undefined },
    );
    render(<LeRobotGridHoverVideo video={nativeVideo(20, 21)} />);
    const element = screen.getByTestId(
      "lerobot-grid-hover-video",
    ) as HTMLVideoElement;

    fireEvent.loadedMetadata(element);
    fireEvent.seeked(element);
    expect(element.style.visibility).toBe("visible");

    element.currentTime = 21;
    fireEvent.timeUpdate(element);
    expect(element.currentTime).toBe(20);
    expect(element.style.visibility).not.toBe("visible");
  });

  it("captures and retains an uncached native poster without playing", () => {
    const drawImage = vi.fn();
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockImplementation(
      () => ({ drawImage }) as unknown as never,
    );
    const onCanvasCommitted = vi.fn();
    const onSurfaceRetainedBytesChange = vi.fn();
    render(
      <LeRobotGridHoverVideo
        capturePoster
        onCanvasCommitted={onCanvasCommitted}
        onSurfaceRetainedBytesChange={onSurfaceRetainedBytesChange}
        playing={false}
        video={nativeVideo(14.2, 37.5)}
      />,
    );
    const element = screen.getByTestId(
      "lerobot-grid-hover-video",
    ) as HTMLVideoElement;
    const poster = screen.getByTestId(
      "lerobot-grid-native-poster",
    ) as HTMLCanvasElement;

    fireEvent.loadedMetadata(element);
    expect(element.currentTime).toBe(14.2);
    expect(HTMLMediaElement.prototype.play).not.toHaveBeenCalled();

    Object.defineProperty(element, "readyState", {
      configurable: true,
      value: 4,
    });
    presentFrame(14.2);
    expect(drawImage).toHaveBeenCalledWith(element, 0, 0, 320, 180);
    expect(onCanvasCommitted).toHaveBeenCalledWith(poster, {
      height: 180,
      width: 320,
    });
    expect(onSurfaceRetainedBytesChange).toHaveBeenCalledWith(320 * 180 * 4);
    expect(poster.style.visibility).toBe("visible");
    expect(element.getAttribute("src")).toBeNull();
  });

  it("reports native AV1 capability failure without loading the asset", () => {
    vi.spyOn(HTMLMediaElement.prototype, "canPlayType").mockReturnValue("");
    const onError = vi.fn();

    render(
      <LeRobotGridHoverVideo
        onError={onError}
        video={nativeVideo(0, 1, "av1")}
      />,
    );

    const element = screen.getByTestId(
      "lerobot-grid-hover-video",
    ) as HTMLVideoElement;
    expect(onError).toHaveBeenCalledWith(
      expect.objectContaining({
        message: "AV1 video playback is unsupported by this browser",
      }),
    );
    expect(element.getAttribute("src")).toBeNull();
  });

  it("cancels frame work and releases the media source on cleanup", () => {
    const { unmount } = render(
      <LeRobotGridHoverVideo video={nativeVideo(30, 31)} />,
    );
    const element = screen.getByTestId(
      "lerobot-grid-hover-video",
    ) as HTMLVideoElement;
    fireEvent.loadedMetadata(element);
    const pendingHandle = [...frameHarness.callbacks.keys()][0];

    unmount();

    expect(
      HTMLVideoElement.prototype.cancelVideoFrameCallback,
    ).toHaveBeenCalledWith(pendingHandle);
    expect(HTMLMediaElement.prototype.pause).toHaveBeenCalled();
    expect(HTMLMediaElement.prototype.load).toHaveBeenCalled();
    expect(element.getAttribute("src")).toBeNull();
    expect(frameHarness.callbacks.size).toBe(0);
  });
});

function nativeVideo(
  startTimeSeconds: number,
  endTimeSeconds: number,
  codec: EpisodePreviewNativeVideo["codec"] = "h264",
): EpisodePreviewNativeVideo {
  return {
    codec,
    codecString: codec === "av1" ? "av01.0.00M.08" : "avc1.64000a",
    endTimeSeconds,
    source: {
      sourceId: "video",
      url: "/asset/video.mp4",
    },
    startTimeSeconds,
  };
}

function presentFrame(mediaTime: number): void {
  const entry = [...frameHarness.callbacks.entries()][0];
  if (!entry) throw new Error("Expected a pending video frame callback");
  const [handle, callback] = entry;
  frameHarness.callbacks.delete(handle);
  act(() => callback(performance.now(), { mediaTime }));
}
