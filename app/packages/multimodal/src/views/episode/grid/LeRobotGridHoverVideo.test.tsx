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

type FrameCallback = (
  now: number,
  metadata: { readonly mediaTime: number },
) => void;

const frameHarness = {
  callbacks: new Map<number, FrameCallback>(),
  nextHandle: 1,
};

beforeEach(() => {
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
});

afterEach(() => {
  cleanup();
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

    presentFrame(14.2);
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
): EpisodePreviewNativeVideo {
  return {
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
