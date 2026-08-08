import MultiModalPlayback from "@fiftyone/multimodal/src/components/MultiModalPlayback/MultiModalPlayback";
import {
  usePlayback,
  useVideoStream,
  useVideoSync,
  type TimelineMode,
  type Track,
} from "@fiftyone/playback";
import * as fos from "@fiftyone/state";
import type { TilingTile } from "@fiftyone/tiling";
import {
  buildTemporalDetectionTracks,
  useVfcClockSource,
} from "@fiftyone/video-annotation";
import React, { useMemo, useRef } from "react";
import { useRecoilValue } from "recoil";

/**
 * POC: the multimodal playback shell (tiling header, mosaic tiles, tile
 * settings sidebar, shared timeline) driving a native video sample in the
 * modal's Explore mode — the surface that renders `VideoLookerReact` today.
 *
 * Reached with `?mmtimeline=1` on a video sample. Not wired to a feature
 * flag and not a shipping path; this exists to make the target architecture
 * concrete and clickable.
 *
 * What it demonstrates:
 *   - `isolateStore={false}` — the shell no longer shadows the modal's own
 *     Jotai atoms, which is what previously kept `TilingProvider` out of here.
 *   - the `<video>` registered as a `PlaybackStream`, with the decoder's
 *     presented-frame time as the engine's clock source.
 *   - temporal detections rendered as timeline tracks.
 *   - tiles: split / duplicate / change type / add, all against one clock.
 */

const VIDEO_STREAM_ID = "poc-video";
const MAIN_TILE_ID = "video-1";

/** Query-param opt-in, read once at mount. */
export function useIsVideoMultiModalPoc(): boolean {
  return useMemo(() => {
    if (typeof window === "undefined") return false;
    return new URLSearchParams(window.location.search).get("mmtimeline") === "1";
  }, []);
}

/**
 * `<video>` bound to the playback engine. Deliberately plain — no Lighter,
 * no overlays. The point here is the shell and the clock, not the renderer;
 * the real M1 tile would host `VideoLighterTile`.
 */
const PocVideoTile: React.FC<{ videoSrc: string }> = ({ videoSrc }) => {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const kickedRef = useRef(false);
  const { seek } = usePlayback();

  // Video-anchored playback: the clock source owns presentation time, so the
  // stream itself is non-blocking (gating twice produces spurious stalls).
  useVideoStream(VIDEO_STREAM_ID, videoRef, { blocking: false });
  useVideoSync(videoRef);
  useVfcClockSource(videoRef);

  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        overflow: "hidden",
      }}
    >
      <video
        ref={videoRef}
        src={videoSrc}
        preload="auto"
        playsInline
        muted
        style={{ maxWidth: "100%", maxHeight: "100%" }}
        onLoadedData={() => {
          // The engine's RAF loop is dormant while paused, so nothing commits
          // until something moves the playhead. Kick it once so the first
          // frame and the ruler agree on mount.
          if (kickedRef.current) return;
          kickedRef.current = true;
          seek(0);
        }}
      />
    </div>
  );
};

/** Sample JSON as a tile — the disposition the plan proposes for the
 *  looker's `{}` button. */
const PocJsonTile: React.FC<{ sample: fos.ModalSample }> = ({ sample }) => (
  <pre
    style={{
      margin: 0,
      padding: "0.75rem",
      height: "100%",
      overflow: "auto",
      fontSize: "0.75rem",
      lineHeight: 1.5,
    }}
  >
    {JSON.stringify(sample.sample, null, 2)}
  </pre>
);

export const VideoMultiModalPoc: React.FC<{ sample: fos.ModalSample }> = ({
  sample,
}) => {
  const colorScheme = useRecoilValue(fos.colorScheme);

  const videoSrc = useMemo(() => {
    const url = sample.urls?.[0]?.url;
    return url ? fos.getSampleSrc(url) : null;
  }, [sample]);

  const frameRate = sample.frameRate;

  const fileName = useMemo(() => {
    const path = sample.sample.filepath ?? "";
    return path.split(/[/\\]/).pop() || "video";
  }, [sample]);

  // Frame-numbered ruler when we know the frame rate; elapsed seconds if not.
  const mode = useMemo<TimelineMode>(
    () =>
      frameRate && Number.isFinite(frameRate) && frameRate > 0
        ? { kind: "sequence", fps: frameRate }
        : { kind: "duration" },
    [frameRate],
  );

  // Temporal detections -> timeline tracks. `buildTemporalDetectionTracks` is
  // the same pure builder the annotate surface uses.
  const tracks = useMemo<Track[]>(() => {
    if (!frameRate) return [];
    return buildTemporalDetectionTracks({
      sample: sample.sample as unknown as Record<string, unknown>,
      fps: frameRate,
      resolveColor: () => colorScheme.colorPool[0] ?? "#ff6d04",
    });
  }, [sample, frameRate, colorScheme]);

  const initialTiles = useMemo<Record<string, TilingTile>>(() => {
    if (!videoSrc) return {};
    return {
      [MAIN_TILE_ID]: {
        type: "video",
        title: fileName,
        render: () => <PocVideoTile videoSrc={videoSrc} />,
      },
      "json-1": {
        type: "sample-json",
        title: "Sample JSON",
        render: () => <PocJsonTile sample={sample} />,
      },
    };
  }, [videoSrc, fileName, sample]);

  if (!videoSrc) {
    return <div style={{ padding: 16 }}>No media URL on this sample.</div>;
  }

  return (
    <MultiModalPlayback
      fileName={fileName}
      headerCaption={{ text: "multimodal timeline POC" }}
      mode={mode}
      tracks={tracks}
      defaultPinnedTrackIds={tracks.map((t) => t.id)}
      initialTiles={initialTiles}
      // The modal owns the right-hand Explore sidebar already.
      rightSidebar={null}
      defaultLeftOpen={false}
      // The whole point of M0: share the modal's Jotai store so the modal's
      // own atoms (sidebar, modal mode) keep resolving inside the shell.
      isolateStore={false}
    />
  );
};
