import type { ImaVidFramesController } from "@fiftyone/looker/src/lookers/imavid/controller";
import type { PlayheadState } from "@fiftyone/playback";
import {
  PLAYHEAD_STATE_BUFFERING,
  PLAYHEAD_STATE_PAUSED,
  PLAYHEAD_STATE_PLAYING,
} from "@fiftyone/playback";
import type { BufferRange } from "@fiftyone/utilities";

type FramesController = Pick<
  ImaVidFramesController,
  | "enqueueFetch"
  | "fetchBufferManager"
  | "key"
  | "resumeFetch"
  | "storeBufferManager"
>;

interface Playhead {
  get: () => PlayheadState;
  set: (state: PlayheadState) => void;
}

/**
 * Resolves once the frames store holds `range`, fetching what is missing.
 */
export const loadImaVidRange = async (
  controller: FramesController,
  range: Readonly<BufferRange>,
  playhead: Playhead,
): Promise<void> => {
  const { storeBufferManager, fetchBufferManager } = controller;

  if (storeBufferManager.containsRange(range)) {
    return;
  }

  const unprocessedStoreBufferRange =
    storeBufferManager.getUnprocessedBufferRange(range);
  const unprocessedBufferRange = fetchBufferManager.getUnprocessedBufferRange(
    unprocessedStoreBufferRange,
  );

  // if looker is playing, don't change playhead to buffering status
  // we indicate buffering status in status bar
  if (playhead.get() !== PLAYHEAD_STATE_PLAYING) {
    playhead.set(PLAYHEAD_STATE_BUFFERING);
  }

  // a range already being fetched, e.g. by the grid thumbnail sharing this
  // controller, is not stored yet, so it is still waited on
  if (unprocessedBufferRange) {
    controller.enqueueFetch(unprocessedBufferRange);
    controller.resumeFetch();
  }

  return new Promise<void>((resolve) => {
    const fetchMoreListener = (e: CustomEvent) => {
      if (e.detail.id !== controller.key) {
        return;
      }

      if (storeBufferManager.containsRange(unprocessedStoreBufferRange)) {
        // if we were buffering, set playhead state to playing
        if (playhead.get() === PLAYHEAD_STATE_BUFFERING) {
          playhead.set(PLAYHEAD_STATE_PAUSED);
        }

        resolve();

        window.removeEventListener(
          "fetchMore",
          fetchMoreListener as EventListener,
        );
      }
    };

    window.addEventListener("fetchMore", fetchMoreListener as EventListener);
  });
};
