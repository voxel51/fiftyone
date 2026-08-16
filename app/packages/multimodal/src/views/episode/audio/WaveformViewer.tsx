import { useViewEnd, useViewStart } from "@fiftyone/playback";
import clsx from "clsx";
import React, { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { PeakPyramid } from "./peak-pyramid";
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

const DEFAULT_COLOR: readonly [number, number, number, number] = [0.4, 0.7, 1, 1];

function hasWebGpu(): boolean {
  return typeof navigator !== "undefined" && "gpu" in navigator && !!navigator.gpu;
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
  const rendererRef = useRef<Pick<WaveformRenderer, "render" | "dispose"> | null>(
    null,
  );
  const [gpuAvailable] = useState(hasWebGpu);
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
    const factory = createRenderer ?? ((canvas) => WaveformRenderer.create(canvas));
    factory(canvasRef.current).then((renderer) => {
      if (cancelled) {
        renderer.dispose();
        return;
      }
      rendererRef.current = renderer;
      setReady(true);
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
      color: track.color ?? DEFAULT_COLOR,
    }));
    renderer.render({ viewStart, viewEnd, canvas, rows });
  }, [ready, tracks, viewStart, viewEnd, surfaceEpoch]);

  if (!gpuAvailable) {
    return (
      <div className={styles.unsupported} data-testid="waveform-viewer-unsupported">
        Waveform requires WebGPU
      </div>
    );
  }

  return (
    <canvas
      ref={canvasRef}
      className={clsx(styles.canvas, className)}
      data-testid="waveform-viewer-canvas"
    />
  );
};

export default WaveformViewer;
