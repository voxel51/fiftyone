import { Size, Spinner } from "@voxel51/voodo";
import clsx from "clsx";
import React, { useEffect, useState } from "react";
import { usePlayback } from "../../../lib/playback/PlaybackProvider";
import { useStream } from "../../../lib/playback/use-stream";
import { useTileId } from "@fiftyone/tiling";
import styles from "./BlockingTile.module.css";
import { RandomBlockingStream } from "./RandomBlockingStream";

/**
 * Blocking demo tile: registers a `RandomBlockingStream` that flips
 * between "ready" and "loading" on a timer. When loading, the entire
 * playback engine stalls (the visual playhead freezes, every other tile
 * pauses with it) until this stream comes back. The body renders either
 * a "DATA EXISTS" status or a "BUFFERING" message with a spinner.
 *
 * Keeps `buffering` in component state and mirrors it from the stream
 * via a callback so the tile can re-render independently of the engine —
 * the engine sees the state change through `bufferState()`, the UI sees
 * it through React state.
 */
const BlockingTile: React.FC = () => {
  const tileId = useTileId();
  const { registerStream } = usePlayback();
  const [buffering, setBuffering] = useState(false);
  const streamId = tileId ?? "blocking";

  // registerStream is a stable action — only the streamId drives re-init.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    const stream = new RandomBlockingStream(streamId, setBuffering);
    const unregister = registerStream(stream);
    return () => {
      unregister();
      stream.destroy();
    };
  }, [streamId]);

  // Activate the stream so the engine drives it (and stalls on it).
  useStream(streamId);

  return (
    <div
      className={clsx(
        styles.body,
        buffering ? styles.buffering : styles.ready
      )}
    >
      {buffering ? (
        <>
          <Spinner size={Size.Lg} />
          <span className={clsx(styles.label, styles.bufferingLabel)}>
            Buffering
          </span>
        </>
      ) : (
        <>
          <span className={styles.dot} />
          <span className={clsx(styles.label, styles.readyLabel)}>
            Data exists
          </span>
        </>
      )}
      <span className={styles.streamId}>{streamId}</span>
    </div>
  );
};

export default BlockingTile;
