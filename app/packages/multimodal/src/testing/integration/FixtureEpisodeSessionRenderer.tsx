import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from "react";

import {
  VISUALIZATION_KIND,
  type DecodedFrame,
  type DecodedVisualization,
  type ImageVisualization,
} from "../../ir";
import type { EpisodeSession } from "../../ports";
import { errorMessage } from "../../utils/errors";
import { PointCloudPanel } from "../../visualization/composition";
import { ImagePanel } from "../../visualization/media-2d/ImagePanel";

const PLAYBACK_TICK_MS = 50;
const NANOSECONDS_PER_MILLISECOND = 1_000_000n;

/** Inputs for the test-only format-agnostic session renderer. */
export interface FixtureEpisodeSessionRendererProps {
  readonly session: EpisodeSession;
  readonly variant?: "grid" | "modal";
}

/**
 * Test-only format-agnostic episode shell used to exercise adapter contracts
 * through the same session port as production surfaces.
 */
export function FixtureEpisodeSessionRenderer({
  session,
  variant = "modal",
}: FixtureEpisodeSessionRendererProps) {
  const { startNs, endNs } = session.manifest.timeRange;
  const [playheadNs, setPlayheadNs] = useState(startNs);
  const [playing, setPlaying] = useState(false);
  const frames = useEpisodeFrames(session, playheadNs);
  const durationMs = bigintToBoundedNumber(
    (endNs - startNs) / NANOSECONDS_PER_MILLISECOND,
  );
  const playheadMs = bigintToBoundedNumber(
    (playheadNs - startNs) / NANOSECONDS_PER_MILLISECOND,
  );

  // This effect owns activation and disposal of the supplied fixture session.
  useEffect(() => {
    session.activate?.();
    return () => session.dispose();
  }, [session]);

  // This effect advances fixture playback until it reaches the session end.
  useEffect(() => {
    if (!playing) return undefined;
    const timer = setInterval(() => {
      setPlayheadNs((current) => {
        const next =
          current + BigInt(PLAYBACK_TICK_MS) * NANOSECONDS_PER_MILLISECOND;
        if (next >= endNs) {
          setPlaying(false);
          return endNs;
        }
        return next;
      });
    }, PLAYBACK_TICK_MS);
    return () => clearInterval(timer);
  }, [endNs, playing]);

  const displayedFrames = useMemo(() => {
    const ordered = session.manifest.streams.flatMap((stream) => {
      const frame = frames.byStream.get(stream.id);
      return frame ? [{ frame, label: stream.sourceName }] : [];
    });
    if (variant === "modal") return ordered;
    const preferred = ordered.find(({ frame }) => {
      const kind = frame.output.visualization?.kind;
      return (
        kind === VISUALIZATION_KIND.RAW_IMAGE ||
        kind === VISUALIZATION_KIND.ENCODED_IMAGE ||
        kind === VISUALIZATION_KIND.ENCODED_VIDEO ||
        kind === VISUALIZATION_KIND.POINT_CLOUD
      );
    });
    return preferred ? [preferred] : ordered.slice(0, 1);
  }, [frames.byStream, session.manifest.streams, variant]);

  return (
    <section
      aria-label={`${session.manifest.episodeId} episode`}
      data-testid={`episode-session-${variant}`}
      style={variant === "grid" ? styles.gridRoot : styles.modalRoot}
    >
      {variant === "modal" ? (
        <header style={styles.controls}>
          <button
            aria-label={playing ? "Pause episode" : "Play episode"}
            onClick={() => setPlaying((current) => !current)}
            type="button"
          >
            {playing ? "Pause" : "Play"}
          </button>
          <input
            aria-label="Episode timeline"
            max={Math.max(0, durationMs)}
            min={0}
            onChange={(event) => {
              const offsetMs = Math.max(0, Number(event.currentTarget.value));
              setPlayheadNs(
                startNs +
                  BigInt(Math.round(offsetMs)) * NANOSECONDS_PER_MILLISECOND,
              );
            }}
            step={1}
            type="range"
            value={playheadMs}
          />
          <output aria-label="Episode playhead">
            {formatDuration(playheadNs - startNs)} /{" "}
            {formatDuration(endNs - startNs)}
          </output>
        </header>
      ) : null}

      {frames.error ? (
        <div role="alert" style={styles.status}>
          {frames.error}
        </div>
      ) : displayedFrames.length === 0 ? (
        <div role="status" style={styles.status}>
          Loading episode
        </div>
      ) : (
        <div style={variant === "grid" ? styles.grid : styles.tiles}>
          {displayedFrames.map(({ frame, label }) => (
            <EpisodeFrame key={frame.streamId} frame={frame} label={label} />
          ))}
        </div>
      )}
    </section>
  );
}

function useEpisodeFrames(session: EpisodeSession, playheadNs: bigint) {
  const [state, setState] = useState<{
    readonly byStream: ReadonlyMap<string, DecodedFrame>;
    readonly error: string | null;
  }>({ byStream: new Map(), error: null });
  const requestId = useRef(0);

  // This effect reads the latest frames for the current fixture playhead.
  useEffect(() => {
    const id = ++requestId.current;
    const controller = new AbortController();
    void (async () => {
      const byStream = new Map<string, DecodedFrame>();
      try {
        for await (const batch of session.read({
          priority: "current",
          signal: controller.signal,
          streams: session.manifest.streams.map((stream) => stream.id),
          window: {
            endNs: playheadNs,
            startNs: session.manifest.timeRange.startNs,
          },
        })) {
          const frame = batch.frames.at(-1);
          if (frame) byStream.set(batch.stream, frame);
        }
        if (id === requestId.current) setState({ byStream, error: null });
      } catch (error) {
        if (controller.signal.aborted || id !== requestId.current) return;
        setState({ byStream: new Map(), error: errorMessage(error) });
      }
    })();
    return () => controller.abort();
  }, [playheadNs, session]);

  return state;
}

function EpisodeFrame({
  frame,
  label,
}: {
  readonly frame: DecodedFrame;
  readonly label: string;
}) {
  const visualization = frame.output.visualization;
  return (
    <article
      aria-label={label}
      data-stream-id={frame.streamId}
      style={styles.tile}
    >
      <strong style={styles.tileLabel}>{label}</strong>
      <div style={styles.panel}>
        {visualization ? (
          <VisualizationFrame frame={frame} visualization={visualization} />
        ) : frame.output.scalars?.length ? (
          <dl style={styles.values}>
            {frame.output.scalars.map((scalar, index) => (
              <div key={`${scalar.field ?? "value"}:${index}`}>
                <dt>{scalar.field ?? "value"}</dt>
                <dd>{scalar.value}</dd>
              </div>
            ))}
          </dl>
        ) : frame.output.transforms?.length ? (
          <span>{frame.output.transforms.length} transforms</span>
        ) : (
          <span>No visual payload</span>
        )}
      </div>
    </article>
  );
}

function VisualizationFrame({
  frame,
  visualization,
}: {
  readonly frame: DecodedFrame;
  readonly visualization: DecodedVisualization;
}) {
  if (isImageVisualization(visualization)) {
    return (
      <ImagePanel
        alt={frame.streamId}
        canvasSurface="episode-session"
        frame={visualization}
        style={styles.visualization}
        textureKey={`${frame.streamId}\n${frame.timestampNs}`}
      />
    );
  }
  if (visualization.kind === VISUALIZATION_KIND.POINT_CLOUD) {
    return (
      <PointCloudPanel
        canvasSurface="episode-session"
        layers={[
          {
            contentTimeNs: frame.timestampNs,
            frame: visualization,
            id: frame.streamId,
          },
        ]}
        showControls={false}
        showGizmo={false}
        showHud={false}
        style={styles.visualization}
      />
    );
  }
  if (visualization.kind === VISUALIZATION_KIND.GRID) {
    return (
      <PointCloudPanel
        canvasSurface="episode-session"
        gridLayers={[
          {
            contentTimeNs: frame.timestampNs,
            frame: visualization,
            id: frame.streamId,
          },
        ]}
        layers={[]}
        showControls={false}
        showGizmo={false}
        showHud={false}
        style={styles.visualization}
      />
    );
  }
  return (
    <span data-visualization-kind={visualization.kind}>
      {visualization.kind}
    </span>
  );
}

function isImageVisualization(
  visualization: DecodedVisualization,
): visualization is ImageVisualization {
  return (
    visualization.kind === VISUALIZATION_KIND.RAW_IMAGE ||
    visualization.kind === VISUALIZATION_KIND.ENCODED_IMAGE ||
    visualization.kind === VISUALIZATION_KIND.ENCODED_VIDEO
  );
}

function bigintToBoundedNumber(value: bigint): number {
  if (value <= 0n) return 0;
  const max = BigInt(Number.MAX_SAFE_INTEGER);
  return Number(value > max ? max : value);
}

function formatDuration(value: bigint): string {
  const seconds = Number(value) / 1e9;
  return `${Math.max(0, seconds).toFixed(2)}s`;
}

const styles: Readonly<Record<string, CSSProperties>> = {
  controls: {
    alignItems: "center",
    display: "grid",
    gap: 12,
    gridTemplateColumns: "auto minmax(120px, 1fr) auto",
    padding: 12,
  },
  grid: { height: "100%", minHeight: 0 },
  gridRoot: { height: "100%", minHeight: 0, width: "100%" },
  modalRoot: {
    background: "#181818",
    color: "#f4f4f4",
    display: "grid",
    gridTemplateRows: "auto minmax(0, 1fr)",
    height: "100%",
    width: "100%",
  },
  panel: { flex: 1, minHeight: 0, overflow: "hidden" },
  status: { alignSelf: "center", justifySelf: "center" },
  tile: {
    border: "1px solid #343434",
    display: "flex",
    flexDirection: "column",
    minHeight: 180,
    minWidth: 0,
  },
  tileLabel: { padding: "6px 8px" },
  tiles: {
    display: "grid",
    gap: 8,
    gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
    minHeight: 0,
    overflow: "auto",
    padding: 8,
  },
  values: { margin: 12 },
  visualization: { height: "100%", minHeight: 0, width: "100%" },
};
