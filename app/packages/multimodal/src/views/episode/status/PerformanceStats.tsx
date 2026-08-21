import {
  getCurrentTime,
  subscribeCurrentTime,
  useBufferingDetail,
  useDuration,
  useIsPlaying,
  usePlaybackStore,
} from "@fiftyone/playback";
import {
  Button,
  Card,
  CardBackground,
  Orientation,
  Size,
  Spacing,
  Stack,
  Text,
  TextColor,
  TextVariant,
  Variant,
} from "@voxel51/voodo";
import {
  memo,
  useCallback,
  useEffect,
  useMemo,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import { gpuPointCloudProjectionResourceStats } from "../../../visualization/composition/gpu-point-cloud-projection-resources";
import { gridLiveLeaseStats } from "../../../visualization/webgpu/webgpu-live-lease";
import { graphicsRendererStats } from "../../../visualization/webgpu/graphics-renderer-registry";
import { webGpuSnapshotRendererStats } from "../../../visualization/scene-3d/gpu/webgpu-snapshot-renderer";
import { imageTextureCacheStats } from "../../../visualization/media-2d/image-texture-cache";
import { gpuPointCloudColormapTextureStats } from "../../../visualization/scene-3d/gpu/gpu-point-cloud-colormap-texture";
import { mapPerformanceStats } from "../map/rendering/performance";
import styles from "../settings/modal/SettingsSidebar.module.css";
import type { PointCloudSamplingSummary } from "./health";
import { useCopyFeedback } from "../../../visualization/panel-ui/use-copy-feedback";

const STATS_REFRESH_INTERVAL_MS = 1_000;
const PLAYHEAD_REFRESH_INTERVAL_MS = 250;
const COPY_CONFIRMATION_MS = 1_500;
const LONG_FRAME_THRESHOLD_MS = 50;

interface BrowserPerformanceMemory {
  readonly jsHeapSizeLimit: number;
  readonly usedJSHeapSize: number;
}

interface PerformanceWithMemory extends Performance {
  readonly memory?: BrowserPerformanceMemory;
}

interface FramePerformanceStats {
  readonly averageFrameTimeMs: number | null;
  readonly framesPerSecond: number | null;
  readonly longFrames: number;
  readonly p95FrameTimeMs: number | null;
}

/** Displays opt-in live performance diagnostics for the active episode scene. */
export default function PerformanceStats({
  sampling,
}: {
  readonly sampling: PointCloudSamplingSummary | null;
}) {
  const [open, setOpen] = useState(false);

  return (
    <div className={styles.statsDisclosure}>
      <Button
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
        size={Size.Sm}
        variant={Variant.Secondary}
      >
        {open ? "Hide stats" : "Stats"}
      </Button>
      {open ? <LivePerformanceStats sampling={sampling} /> : null}
    </div>
  );
}

function LivePerformanceStats({
  sampling,
}: {
  readonly sampling: PointCloudSamplingSummary | null;
}) {
  const playbackStore = usePlaybackStore();
  const duration = useDuration();
  const isPlaying = useIsPlaying();
  const bufferingDetail = useBufferingDetail();
  const framePerformance = useFramePerformanceStats();
  const [runtime, setRuntime] = useState(readRuntimeStats);
  const [copied, showCopyFeedback] = useCopyFeedback(
    false,
    COPY_CONFIRMATION_MS,
  );

  // This effect samples cumulative runtime counters for the live panel.
  useEffect(() => {
    const interval = setInterval(
      () => setRuntime(readRuntimeStats()),
      STATS_REFRESH_INTERVAL_MS,
    );
    return () => clearInterval(interval);
  }, []);

  const snapshotBase = useMemo(
    () => ({
      ...runtime,
      playback: {
        buffering: bufferingDetail,
        durationSec: duration,
        playing: isPlaying,
      },
      rendering: framePerformance,
      pointCloudSampling: sampling,
    }),
    [bufferingDetail, duration, framePerformance, isPlaying, runtime, sampling],
  );
  const copySnapshot = useCallback(async () => {
    if (!navigator.clipboard?.writeText) return;
    const snapshot = {
      ...snapshotBase,
      playback: {
        ...snapshotBase.playback,
        currentTimeSec: getCurrentTime(playbackStore),
      },
    };
    try {
      await navigator.clipboard.writeText(JSON.stringify(snapshot, null, 2));
    } catch {
      return;
    }
    showCopyFeedback(true);
  }, [playbackStore, showCopyFeedback, snapshotBase]);

  const {
    environment,
    gridLive,
    imageTextures,
    map,
    projection,
    snapshotRenderer,
    graphics,
  } = snapshotBase;

  return (
    <Card background={CardBackground.Secondary} compact outlined>
      <Stack orientation={Orientation.Column} spacing={Spacing.Md}>
        <div className={styles.statsHeader}>
          <Text color={TextColor.Primary} variant={TextVariant.Sm}>
            Performance diagnostics
          </Text>
          <Button
            onClick={copySnapshot}
            size={Size.Xs}
            variant={Variant.Secondary}
          >
            {copied ? "Copied" : "Copy JSON"}
          </Button>
        </div>

        <StatsGroup
          rows={[
            ["State", isPlaying ? "Playing" : "Paused"],
            ["Playhead", <SampledPlayheadValue key="playhead" />],
            ["Duration", formatSeconds(duration)],
            ["Buffering", bufferingDetail ?? "No"],
          ]}
          title="Playback"
        />
        <StatsGroup
          rows={[
            ["FPS", formatOptionalDecimal(framePerformance.framesPerSecond)],
            [
              "Average frame time",
              formatOptionalMilliseconds(framePerformance.averageFrameTimeMs),
            ],
            [
              "P95 frame time",
              formatOptionalMilliseconds(framePerformance.p95FrameTimeMs),
            ],
            [
              `Long frames (≥${LONG_FRAME_THRESHOLD_MS} ms)`,
              `${formatInteger(framePerformance.longFrames)} / s`,
            ],
          ]}
          title="Rendering"
        />
        <StatsGroup
          rows={[
            [
              "Tile / surface commits",
              `${map.reactCommits.tile} / ${map.reactCommits.surface}`,
            ],
            ["Playback paints", formatInteger(map.playbackPaints)],
            ["Follow commands", formatInteger(map.followCommands)],
            ["GeoJSON source updates", formatInteger(map.totalSourceUpdates)],
          ]}
          title="Map"
        />
        <StatsGroup
          rows={[
            [
              "Requested backend",
              graphics.requestedBackend === "webgl2"
                ? "WebGL2 (diagnostic override)"
                : "Auto",
            ],
            [
              "WebGPU API",
              graphics.webGpuApiAvailable ? "Available" : "Unavailable",
            ],
            [
              "Active backends",
              `${graphics.renderers.byBackend.webgpu} WebGPU / ${graphics.renderers.byBackend.webgl2} WebGL2 / ${graphics.renderers.initializing} initializing`,
            ],
            [
              "WebGPU devices",
              `${graphics.webGpuDevices.live} / ${graphics.webGpuDevices.budget}`,
            ],
            [
              "WebGPU reservations",
              formatInteger(graphics.webGpuDevices.reserved),
            ],
            [
              "Device high-water",
              formatInteger(graphics.webGpuDevices.highWaterMark),
            ],
            [
              "Renderers created / disposed",
              `${graphics.renderers.created} / ${graphics.renderers.disposed}`,
            ],
            [
              "WebGL fallbacks",
              formatInteger(graphics.renderers.webGlFallbacks),
            ],
            [
              "WebGL diagnostic overrides",
              formatInteger(graphics.renderers.webGlOverrides),
            ],
            [
              "Init failures / device losses",
              `${graphics.renderers.initFailures} / ${graphics.renderers.deviceLosses}`,
            ],
            ["Over budget", graphics.webGpuDevices.overBudget ? "Yes" : "No"],
            ...(graphics.lastError
              ? ([
                  ["Last renderer error", graphics.lastError] as const,
                ] as const)
              : []),
            ...Object.entries(graphics.renderers.bySurface).map(
              ([surface, counts]) =>
                [
                  "Surface · " + surface,
                  formatSurfaceBackends(counts),
                ] as const,
            ),
          ]}
          title="Graphics"
        />
        <StatsGroup
          rows={[
            ["Live grid leases", `${gridLive.active} / ${gridLive.cap}`],
            ["Granted", formatInteger(gridLive.granted)],
            ["Denied / revoked", `${gridLive.denied} / ${gridLive.revoked}`],
            [
              "Snapshot renderer",
              snapshotRenderer.rendererAlive ? "Alive" : "Idle",
            ],
            ["Snapshot queue", formatInteger(snapshotRenderer.pendingJobs)],
            [
              "Snapshot run / failed",
              `${snapshotRenderer.jobsRun} / ${snapshotRenderer.jobsFailed}`,
            ],
            [
              "Snapshot cancelled",
              formatInteger(snapshotRenderer.jobsCancelled),
            ],
          ]}
          title="Grid & snapshots"
        />
        <StatsGroup
          rows={[
            ["Image textures", formatInteger(imageTextures.entryCount)],
            ["Retained textures", formatInteger(imageTextures.retainedCount)],
            ["Image decodes", formatInteger(imageTextures.decodeCount)],
            [
              "Projection resources",
              `${projection.activeCount} active / ${projection.entryCount} cached`,
            ],
            ["Retired projections", formatInteger(projection.retiredCount)],
            [
              "Projection allocations",
              formatInteger(projection.totalResourceAllocations),
            ],
            ["Projection updates", formatInteger(projection.totalFrameUpdates)],
            [
              "Colormap textures",
              formatInteger(runtime.colormapTextures.entryCount),
            ],
            [
              "Sampled clouds",
              sampling
                ? `${sampling.sampledCloudCount} · largest ${formatInteger(sampling.largestFinitePointCount)}`
                : "0",
            ],
          ]}
          title="GPU resources"
        />
        <StatsGroup
          rows={[
            [
              "Viewport",
              `${environment.viewportWidth} × ${environment.viewportHeight}`,
            ],
            ["Device pixel ratio", formatDecimal(environment.devicePixelRatio)],
            [
              "Hardware concurrency",
              formatOptionalInteger(environment.hardwareConcurrency),
            ],
            [
              "Device memory",
              formatOptionalGigabytes(environment.deviceMemoryGb),
            ],
            ["JS heap used", formatOptionalBytes(environment.jsHeapUsedBytes)],
            [
              "JS heap limit",
              formatOptionalBytes(environment.jsHeapLimitBytes),
            ],
          ]}
          title="Browser"
        />
      </Stack>
    </Card>
  );
}

const SampledPlayheadValue = memo(function SampledPlayheadValue() {
  const currentTime = useSampledCurrentTime();
  return <>{formatSeconds(currentTime)}</>;
});

/** Coalesces playback commits so only this tiny readout updates at 4 Hz. */
function useSampledCurrentTime(): number {
  const store = usePlaybackStore();
  const subscribe = useCallback(
    (onStoreChange: () => void) => {
      let refreshTimer: ReturnType<typeof setTimeout> | null = null;
      const unsubscribe = subscribeCurrentTime(store, () => {
        if (refreshTimer !== null) return;
        refreshTimer = setTimeout(() => {
          refreshTimer = null;
          onStoreChange();
        }, PLAYHEAD_REFRESH_INTERVAL_MS);
      });

      return () => {
        unsubscribe();
        if (refreshTimer !== null) clearTimeout(refreshTimer);
      };
    },
    [store],
  );
  const getSnapshot = useCallback(() => getCurrentTime(store), [store]);

  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}

function useFramePerformanceStats(): FramePerformanceStats {
  const [stats, setStats] = useState<FramePerformanceStats>({
    averageFrameTimeMs: null,
    framesPerSecond: null,
    longFrames: 0,
    p95FrameTimeMs: null,
  });

  // This effect samples browser frame cadence for the rendering summary.
  useEffect(() => {
    if (typeof window.requestAnimationFrame !== "function") return;

    let animationFrame = 0;
    let frameDurations: number[] = [];
    let lastFrameAt: number | null = null;
    let windowStartedAt = performance.now();

    const measureFrame = (now: number) => {
      if (lastFrameAt !== null) {
        frameDurations.push(now - lastFrameAt);
      }
      lastFrameAt = now;

      const elapsed = now - windowStartedAt;
      if (elapsed >= STATS_REFRESH_INTERVAL_MS && frameDurations.length > 0) {
        const sortedDurations = [...frameDurations].sort(
          (left, right) => left - right,
        );
        const totalFrameTime = frameDurations.reduce(
          (total, duration) => total + duration,
          0,
        );
        const p95Index = Math.min(
          sortedDurations.length - 1,
          Math.ceil(sortedDurations.length * 0.95) - 1,
        );
        setStats({
          averageFrameTimeMs: totalFrameTime / frameDurations.length,
          framesPerSecond: (frameDurations.length * 1_000) / elapsed,
          longFrames: frameDurations.filter(
            (duration) => duration >= LONG_FRAME_THRESHOLD_MS,
          ).length,
          p95FrameTimeMs: sortedDurations[p95Index],
        });
        frameDurations = [];
        windowStartedAt = now;
      }

      animationFrame = window.requestAnimationFrame(measureFrame);
    };

    animationFrame = window.requestAnimationFrame(measureFrame);
    return () => window.cancelAnimationFrame(animationFrame);
  }, []);

  return stats;
}

function StatsGroup({
  rows,
  title,
}: {
  readonly rows: readonly (readonly [string, ReactNode])[];
  readonly title: string;
}) {
  return (
    <div className={styles.statsGroup}>
      <Text color={TextColor.Secondary} variant={TextVariant.Xs}>
        {title}
      </Text>
      <div className={styles.statsRows}>
        {rows.map(([label, value]) => (
          <div className={styles.statsRow} data-stats-row={label} key={label}>
            <span>{label}</span>
            <span className={styles.statsValue}>{value}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function readRuntimeStats() {
  const nav = navigator as Navigator & { readonly deviceMemory?: number };
  const memory = (performance as PerformanceWithMemory).memory;
  return {
    capturedAt: new Date().toISOString(),
    colormapTextures: gpuPointCloudColormapTextureStats(),
    environment: {
      deviceMemoryGb: finiteOrNull(nav.deviceMemory),
      devicePixelRatio: finiteOrNull(window.devicePixelRatio) ?? 1,
      hardwareConcurrency: finiteOrNull(nav.hardwareConcurrency),
      jsHeapLimitBytes: finiteOrNull(memory?.jsHeapSizeLimit),
      jsHeapUsedBytes: finiteOrNull(memory?.usedJSHeapSize),
      viewportHeight: window.innerHeight,
      viewportWidth: window.innerWidth,
    },
    gridLive: gridLiveLeaseStats(),
    imageTextures: imageTextureCacheStats(),
    map: mapPerformanceStats(),
    projection: gpuPointCloudProjectionResourceStats(),
    snapshotRenderer: webGpuSnapshotRendererStats(),
    graphics: {
      ...graphicsRendererStats(),
      webGpuApiAvailable: typeof navigator.gpu !== "undefined",
    },
  } as const;
}

function formatSurfaceBackends({
  initializing,
  webgl2,
  webgpu,
}: {
  readonly initializing: number;
  readonly webgl2: number;
  readonly webgpu: number;
}): string {
  const values: string[] = [];
  if (webgpu > 0) values.push(`${webgpu} WebGPU`);
  if (webgl2 > 0) values.push(`${webgl2} WebGL2`);
  if (initializing > 0) values.push(`${initializing} initializing`);
  return values.join(" / ") || "Idle";
}

function finiteOrNull(value: number | undefined): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function formatSeconds(value: number): string {
  return `${value.toFixed(3)} s`;
}

function formatInteger(value: number): string {
  return value.toLocaleString();
}

function formatDecimal(value: number): string {
  return value.toLocaleString(undefined, { maximumFractionDigits: 2 });
}

function formatOptionalDecimal(value: number | null): string {
  return value === null ? "Measuring…" : formatDecimal(value);
}

function formatOptionalMilliseconds(value: number | null): string {
  return value === null ? "Measuring…" : `${formatDecimal(value)} ms`;
}

function formatOptionalInteger(value: number | null): string {
  return value === null ? "Unavailable" : formatInteger(value);
}

function formatOptionalGigabytes(value: number | null): string {
  return value === null ? "Unavailable" : `${formatDecimal(value)} GB`;
}

function formatOptionalBytes(value: number | null): string {
  if (value === null) return "Unavailable";
  return `${formatDecimal(value / (1024 * 1024))} MiB`;
}
