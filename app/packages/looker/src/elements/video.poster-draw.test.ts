import { describe, expect, it, vi } from "vitest";
import { VideoLooker } from "../lookers/video";
import { presentsSeekTarget } from "./util";
import { VideoElement } from "./video";

const FPS = 5;

vi.mock("./util", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./util")>();
  return { ...actual, acquireThumbnailer: vi.fn() };
});

const { acquireThumbnailer } = await import("./util");

/** A pooled thumbnailer whose frame presentation the test drives. */
const fakeVideo = () => {
  const target = new EventTarget();
  let frameCallback: VideoFrameRequestCallback | null = null;
  const video = Object.assign(target, {
    currentTime: 0,
    duration: 3,
    videoWidth: 100,
    videoHeight: 100,
    src: "",
    requestVideoFrameCallback: (callback: VideoFrameRequestCallback) => {
      frameCallback = callback;
      return 1;
    },
    cancelVideoFrameCallback: () => {
      frameCallback = null;
    },
  });
  return {
    video,
    present: (mediaTime: number) => {
      const callback = frameCallback;
      frameCallback = null;
      callback?.(0, { mediaTime } as VideoFrameCallbackMetadata);
    },
    seek: (seconds: number) => {
      video.currentTime = seconds;
      video.dispatchEvent(new Event("seeked"));
    },
  };
};

const drawPoster = async (seconds: number | null) => {
  const media = fakeVideo();
  const release = vi.fn();
  vi.mocked(acquireThumbnailer).mockResolvedValue([
    media.video as unknown as HTMLVideoElement,
    release,
  ]);
  const drawImage = vi.fn();
  const updates: Record<string, unknown>[] = [];
  const element = {
    canvas: { width: 0, height: 0, getContext: () => ({ drawImage }) },
    posterDraw: 0,
    posterSeconds: null,
    update: (change: Record<string, unknown>) => updates.push(change),
  };

  (
    VideoElement.prototype as unknown as {
      drawPoster: (...args: unknown[]) => void;
    }
  ).drawPoster.call(element, "clip.webm", FPS, undefined, seconds, true);
  await vi.waitFor(() => expect(media.video.src).toBe("clip.webm"));
  media.video.dispatchEvent(new Event("loadedmetadata"));

  return { ...media, drawImage, release, updates };
};

const loadedPoster = {
  hasPoster: true,
  posterPending: false,
  duration: 3,
  loaded: true,
};

describe("presentsSeekTarget", () => {
  it.each([
    { name: "no frame presented yet", mediaTime: null, target: 0, is: false },
    { name: "the frame at the target", mediaTime: 0, target: 0, is: true },
    {
      name: "the frame covering the target",
      mediaTime: 1.4,
      target: 1.5,
      is: true,
    },
    {
      name: "the frame from before the seek",
      mediaTime: 0,
      target: 1.5,
      is: false,
    },
    { name: "the next frame", mediaTime: 0.2, target: 0, is: false },
  ])("$name: $is", ({ mediaTime, target, is }) => {
    expect(presentsSeekTarget(mediaTime, target, FPS)).toBe(is);
  });
});

describe("VideoElement poster draw", () => {
  it("waits for the seeked frame when the seek completes before any frame presents", async () => {
    const { drawImage, present, release, seek, updates } =
      await drawPoster(null);

    seek(0);
    expect(drawImage).not.toHaveBeenCalled();
    expect(release).not.toHaveBeenCalled();

    present(0);
    expect(drawImage).toHaveBeenCalledTimes(1);
    expect(release).toHaveBeenCalledTimes(1);
    expect(updates.at(-1)).toEqual(loadedPoster);
  });

  it("draws at the seek when the seeked frame already presented", async () => {
    const { drawImage, present, release, seek, updates } =
      await drawPoster(null);

    present(0);
    seek(0);

    expect(drawImage).toHaveBeenCalledTimes(1);
    expect(release).toHaveBeenCalledTimes(1);
    expect(updates.at(-1)).toEqual(loadedPoster);
  });

  it("draws the target's frame when the seek reports the ended clip's end", async () => {
    const { drawImage, present, release, seek, updates } =
      await drawPoster(null);

    present(0);
    seek(3);

    expect(drawImage).toHaveBeenCalledTimes(1);
    expect(release).toHaveBeenCalledTimes(1);
    expect(updates.at(-1)).toEqual(loadedPoster);
  });

  it("does not draw the frame from before the seek", async () => {
    const { drawImage, present, seek, updates } = await drawPoster(1.5);

    present(0);
    seek(1.5);
    expect(drawImage).not.toHaveBeenCalled();
    expect(updates).not.toContainEqual(loadedPoster);

    present(1.4);
    expect(drawImage).toHaveBeenCalledTimes(1);
    expect(updates.at(-1)).toEqual(loadedPoster);
  });
});

describe("VideoLooker mediaPending", () => {
  const mediaPending = (state: Record<string, unknown>) =>
    Object.getOwnPropertyDescriptor(
      VideoLooker.prototype,
      "mediaPending",
    )?.get?.call({ state });

  it.each([
    { name: "a poster still waiting on its frame", posterPending: true },
    { name: "a drawn poster", posterPending: false },
  ])("reports $name", ({ posterPending }) => {
    expect(mediaPending({ posterPending })).toBe(posterPending);
  });

  it("marks a poster redraw pending until its frame draws", () => {
    const updates: Record<string, unknown>[] = [];
    const element = {
      drawPoster: vi.fn(),
      update: (
        next: (state: {
          config: { src: string; frameRate: number; support: undefined };
        }) => Record<string, unknown>,
      ) =>
        updates.push(
          next({
            config: { src: "clip.webm", frameRate: FPS, support: undefined },
          }),
        ),
    };

    VideoElement.prototype.posterAt.call(element, 1.5);

    expect(updates).toEqual([{ posterPending: true }]);
    expect(element.drawPoster).toHaveBeenCalledWith(
      "clip.webm",
      FPS,
      undefined,
      1.5,
      false,
    );
  });
});
