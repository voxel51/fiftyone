import { getEventBus } from "@fiftyone/events";
import {
  IMAVID_FETCHED_EVENT,
  type ImaVidEvents,
} from "@fiftyone/looker/src/lookers/imavid/events";
import type { PlayheadState } from "@fiftyone/playback";
import { BufferManager } from "@fiftyone/utilities";
import { describe, expect, it, vi } from "vitest";
import { loadImaVidRange } from "./imaVidLoadRange";

const KEY = "frames";

const makeController = () => ({
  enqueueFetch: vi.fn(),
  fetchBufferManager: new BufferManager(),
  key: KEY,
  resumeFetch: vi.fn(),
  // the frames controller seeds its store buffer with the first frame
  storeBufferManager: new BufferManager([[1, 1]]),
});

const makePlayhead = (initial: PlayheadState = "paused") => {
  let state = initial;
  return {
    get: () => state,
    set: vi.fn((next: PlayheadState) => {
      state = next;
    }),
  };
};

const settled = async (promise: Promise<void>) => {
  let done = false;
  promise.then(() => {
    done = true;
  });
  await Promise.resolve();
  await Promise.resolve();
  return done;
};

const fetched = (
  controller: ReturnType<typeof makeController>,
  range: [number, number],
) => {
  controller.storeBufferManager.addNewRange(range);
  getEventBus<ImaVidEvents>().dispatch(IMAVID_FETCHED_EVENT, { id: KEY });
};

describe("loadImaVidRange", () => {
  it("resolves at once when the store holds the range", async () => {
    const controller = makeController();
    controller.storeBufferManager.addNewRange([1, 2]);

    expect(
      await settled(loadImaVidRange(controller, [1, 2], makePlayhead())),
    ).toBe(true);
    expect(controller.enqueueFetch).not.toHaveBeenCalled();
  });

  it("fetches the missing frames and resolves once they are stored", async () => {
    const controller = makeController();
    const playhead = makePlayhead();
    const loading = loadImaVidRange(controller, [1, 2], playhead);

    expect(controller.enqueueFetch).toHaveBeenCalledWith([2, 2]);
    expect(playhead.get()).toBe("buffering");
    expect(await settled(loading)).toBe(false);

    fetched(controller, [1, 2]);

    expect(await settled(loading)).toBe(true);
    expect(playhead.get()).toBe("paused");
  });

  it("waits on a fetch another looker already has in flight", async () => {
    const controller = makeController();
    controller.fetchBufferManager.addNewRange([2, 2]);
    const playhead = makePlayhead();
    const loading = loadImaVidRange(controller, [1, 2], playhead);

    expect(controller.enqueueFetch).not.toHaveBeenCalled();
    expect(playhead.get()).toBe("buffering");
    expect(await settled(loading)).toBe(false);

    fetched(controller, [1, 2]);

    expect(await settled(loading)).toBe(true);
    expect(playhead.get()).toBe("paused");
  });
});
