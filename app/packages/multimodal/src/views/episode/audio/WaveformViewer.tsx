import { useViewEnd, useViewStart } from "@fiftyone/playback";
import clsx from "clsx";
import React, { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { PeakPyramid } from "../../../audio/peak-pyramid";
import { WaveformRenderer, type WaveformRowSpec } from "./waveform-gpu";
import styles from "./WaveformViewer.module.css";

export interface WaveformTrackSpec {
  readonly trackId: string;
  readonly label: string;
  readonly pyramid: PeakPyramid;
  readonly color?: readonly [number, number, number, number];
}

export interface WaveformViewerProps {
  readonly tracks: readonly WaveformTrackSpec[];
  readonly className?: string;
  /**
   * Overridable for tests/stories: a factory returning a renderer (or a
   * pre-built fake) instead of the real `WaveformRenderer.create`, so this
   * component never requires an actual GPU to mount.
   */
  readonly createRenderer?: (
    canvas: HTMLCanvasElement,
  ) => Promise<Pick<WaveformRenderer, "render" | "dispose">>;
}

/**
 * Per-channel base hues, cycled by row index.
 *
 * One flat blue for every row made a stereo pair read as a single smeared
 * band — the two channels were only separable by the gap between them.
 * Distinct hues make left and right identifiable at a glance, and the
 * shader ramps each toward a warm crest at peak amplitude rather than
 * washing out to white.
 */
const CHANNEL_COLORS: readonly (readonly [number, number, number, number])[] = [
  [0.29, 0.78, 0.85, 1], // teal — channel 0 / left
  [0.62, 0.51, 0.93, 1], // violet — channel 1 / right
  [0.35, 0.8, 0.6, 1], // green
  [0.9, 0.55, 0.45, 1], // clay
];

function colorForRow(index: number): readonly [number, number, number, number] {
  return CHANNEL_COLORS[index % CHANNEL_COLORS.length];
}

/** The row's trace colour as CSS, so its label reads as belonging to it. */
function cssColorForRow(index: number): string {
  const [r, g, b] = colorForRow(index);
  return `rgb(${Math.round(r * 255)} ${Math.round(g * 255)} ${Math.round(b * 255)})`;
}

function hasWebGpu(): boolean {
  return (
    typeof navigator !== "undefined" && "gpu" in navigator && !!navigator.gpu
  );
}

/**
 * Canvas-based waveform display for one or more audio tracks, reading
 * the SAME shared `viewStart`/`viewEnd` playback-store state
 * `TimelineRuler` does — pan/zoom on a ruler mounted alongside this
 * viewer repaints it automatically, with no independent pointer handling
 * to build here.
 *
 * No non-WebGPU rendering path exists (per product baseline) — a browser
 * without WebGPU sees a text placeholder rather than a crash.
 */
const WaveformViewer: React.FC<WaveformViewerProps> = ({
  tracks,
  className,
  createRenderer,
}) => {
  const viewStart = useViewStart();
  const viewEnd = useViewEnd();
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const rendererRef = useRef<Pick<
    WaveformRenderer,
    "render" | "dispose"
  > | null>(null);
  const [gpuAvailable] = useState(hasWebGpu);
  // Set when the renderer fails to initialize despite `navigator.gpu`.
  const [unavailable, setUnavailable] = useState(false);
  const [ready, setReady] = useState(false);
  // Bumped whenever the canvas's backing buffer is resized. Assigning
  // `canvas.width`/`height` RESETS the drawing surface, so a resize that
  // lands after a paint silently blanks the waveform — the render effect
  // must re-run, which means resize has to be a render dependency.
  const [surfaceEpoch, setSurfaceEpoch] = useState(0);

  useEffect(() => {
    if (!gpuAvailable || !canvasRef.current) {
      return undefined;
    }
    let cancelled = false;
    const factory =
      createRenderer ?? ((canvas) => WaveformRenderer.create(canvas));
    factory(canvasRef.current)
      .then((renderer) => {
        if (cancelled) {
          renderer.dispose();
          return;
        }
        rendererRef.current = renderer;
        setReady(true);
      })
      .catch(() => {
        // `WaveformRenderer.create` rejects when `requestAdapter()` or
        // `getContext("webgpu")` returns null — both reachable even though
        // `navigator.gpu` exists. Without this the promise rejects
        // unhandled and the canvas stays permanently blank, since
        // `gpuAvailable` is still true and the placeholder never shows.
        if (!cancelled) setUnavailable(true);
      });
    return () => {
      cancelled = true;
      rendererRef.current?.dispose();
      rendererRef.current = null;
      setReady(false);
    };
    // `createRenderer` is a test/story override — expected to be a stable
    // reference (or absent) for the component's lifetime, not re-created
    // per render, so it's intentionally omitted from the dependency list.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gpuAvailable]);

  // Match the canvas's backing buffer to its display size (device-pixel
  // aware) so the waveform isn't blurry — resize observers, not a render
  // effect, since layout can change independent of view-state.
  useLayoutEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return undefined;
    const observer = new ResizeObserver(() => {
      const dpr = window.devicePixelRatio || 1;
      const width = Math.max(1, Math.round(canvas.clientWidth * dpr));
      const height = Math.max(1, Math.round(canvas.clientHeight * dpr));
      if (canvas.width !== width || canvas.height !== height) {
        canvas.width = width;
        canvas.height = height;
        setSurfaceEpoch((epoch) => epoch + 1);
      }
    });
    observer.observe(canvas);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const renderer = rendererRef.current;
    const canvas = canvasRef.current;
    if (!renderer || !canvas || !ready || tracks.length === 0) return;

    // `row.top`/`row.height` are compared against `canvas.height` (the
    // DEVICE-pixel backing buffer) inside the renderer, so they must be in
    // device pixels too — using CSS pixels here squeezed every row into the
    // top 1/dpr of the canvas on any HiDPI display.
    const rowHeightPx = canvas.height / tracks.length;

    const rows: WaveformRowSpec[] = tracks.map((track, index) => ({
      trackId: track.trackId,
      pyramid: track.pyramid,
      top: index * rowHeightPx,
      height: rowHeightPx,
      color: track.color ?? colorForRow(index),
    }));
    renderer.render({ viewStart, viewEnd, canvas, rows });
  }, [ready, tracks, viewStart, viewEnd, surfaceEpoch]);

  if (!gpuAvailable || unavailable) {
    return (
      <div
        className={styles.unsupported}
        data-testid="waveform-viewer-unsupported"
      >
        Waveform requires WebGPU
      </div>
    );
  }

  return (
    <div className={clsx(styles.root, className)}>
      <canvas
        ref={canvasRef}
        className={styles.canvas}
        data-testid="waveform-viewer-canvas"
      />
      {/* Labels are HTML over the canvas rather than drawn in the shader:
          the rows are only distinguishable by hue otherwise, which says
          nothing about which channel is which. Positioned by the same
          index/among fraction the renderer lays the rows out with. */}
      <div className={styles.labels} aria-hidden={false}>
        {tracks.map((track, index) => (
          <span
            className={styles.label}
            data-testid="waveform-row-label"
            key={track.trackId}
            style={{
              color: cssColorForRow(index),
              height: `${100 / tracks.length}%`,
              top: `${(index * 100) / tracks.length}%`,
            }}
          >
            {track.label}
          </span>
        ))}
      </div>
    </div>
  );
};

export default WaveformViewer;
