import {
  useBufferingDetail,
  useCurrentTime,
  useDuration,
  useIsPlaying,
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
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { gpuPointCloudProjectionResourceStats } from "../../../visualization/panels/gpu/gpu-point-cloud-projection-resources";
import { gridLiveLeaseStats } from "../../../visualization/panels/gpu/webgpu-live-lease";
import { webGpuDeviceStats } from "../../../visualization/panels/gpu/webgpu-device-registry";
import { webGpuSnapshotRendererStats } from "../../../visualization/panels/gpu/webgpu-snapshot-renderer";
import { imageTextureCacheStats } from "../../../visualization/panels/image-texture-cache";
import { gpuPointCloudColormapTextureStats } from "../../../visualization/panels/point-cloud/gpu/gpu-point-cloud-colormap-texture";
import styles from "./McapSettingsSidebar.module.css";

const STATS_REFRESH_INTERVAL_MS = 1_000;
const COPY_CONFIRMATION_MS = 1_500;

interface PointCloudSamplingSummary {
  readonly largestFinitePointCount: number;
  readonly sampledCloudCount: number;
}

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

/** Displays opt-in live performance diagnostics for the active MCAP scene. */
export default function McapPerformanceStats({
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
  const currentTime = useCurrentTime();
  const duration = useDuration();
  const isPlaying = useIsPlaying();
  const bufferingDetail = useBufferingDetail();
  const framePerformance = useFramePerformanceStats();
  const [runtime, setRuntime] = useState(readRuntimeStats);
  const [copied, setCopied] = useState(false);
  const copyResetTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const interval = setInterval(
      () => setRuntime(readRuntimeStats()),
      STATS_REFRESH_INTERVAL_MS,
    );
    return () => clearInterval(interval);
  }, []);

  useEffect(
    () => () => {
      if (copyResetTimer.current !== null) {
        clearTimeout(copyResetTimer.current);
      }
    },
    [],
  );

  const snapshot = useMemo(
    () => ({
      ...runtime,
      playback: {
        buffering: bufferingDetail,
        currentTimeSec: currentTime,
        durationSec: duration,
        playing: isPlaying,
      },
      rendering: framePerformance,
      pointCloudSampling: sampling,
    }),
    [
      bufferingDetail,
      currentTime,
      duration,
      framePerformance,
      isPlaying,
      runtime,
      sampling,
    ],
  );
  const copySnapshot = useCallback(async () => {
    if (!navigator.clipboard?.writeText) return;
    try {
      await navigator.clipboard.writeText(JSON.stringify(snapshot, null, 2));
    } catch {
      return;
    }
    setCopied(true);
    if (copyResetTimer.current !== null) {
      clearTimeout(copyResetTimer.current);
    }
    copyResetTimer.current = setTimeout(
      () => setCopied(false),
      COPY_CONFIRMATION_MS,
    );
  }, [snapshot]);

  const {
    environment,
    gridLive,
    imageTextures,
    projection,
    snapshotRenderer,
    webGpu,
  } = snapshot;

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
            ["Playhead", formatSeconds(currentTime)],
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
              "Long frames (≥50 ms)",
              `${formatInteger(framePerformance.longFrames)} / s`,
            ],
          ]}
          title="Rendering"
        />
        <StatsGroup
          rows={[
            ["WebGPU devices", `${webGpu.total} / ${webGpu.budget}`],
            ["Device high-water", formatInteger(webGpu.highWaterMark)],
            [
              "Registered / released",
              `${webGpu.totalRegistered} / ${webGpu.totalReleased}`,
            ],
            ["Over budget", webGpu.overBudget ? "Yes" : "No"],
            ...Object.entries(webGpu.bySurface).map(
              ([surface, count]) =>
                [`Surface · ${surface}`, formatInteger(count)] as const,
            ),
          ]}
          title="WebGPU"
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

function useFramePerformanceStats(): FramePerformanceStats {
  const [stats, setStats] = useState<FramePerformanceStats>({
    averageFrameTimeMs: null,
    framesPerSecond: null,
    longFrames: 0,
    p95FrameTimeMs: null,
  });

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
          longFrames: frameDurations.filter((duration) => duration >= 50)
            .length,
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
  readonly rows: readonly (readonly [string, string])[];
  readonly title: string;
}) {
  return (
    <div className={styles.statsGroup}>
      <Text color={TextColor.Secondary} variant={TextVariant.Xs}>
        {title}
      </Text>
      <div className={styles.statsRows}>
        {rows.map(([label, value]) => (
          <div className={styles.statsRow} key={label}>
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
    projection: gpuPointCloudProjectionResourceStats(),
    snapshotRenderer: webGpuSnapshotRendererStats(),
    webGpu: webGpuDeviceStats(),
  } as const;
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
