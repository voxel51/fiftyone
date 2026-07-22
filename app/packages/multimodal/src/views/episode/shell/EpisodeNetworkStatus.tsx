// Deep imports on purpose: the playback package root barrel pulls view
// components whose relay fragments cannot evaluate under vitest.
import { usePlaybackStore } from "@fiftyone/playback/runtime";
import {
  useBufferingDetail,
  useIsBuffering,
  useIsPlayPending,
} from "@fiftyone/playback/runtime";
import { humanReadableBytes } from "@fiftyone/utilities";
import React, { useEffect, useRef } from "react";
import type { PlaybackReadCapability } from "../../../ports";
import {
  createEpisodeNetworkHealthEstimator,
  shouldPublishEpisodeNetworkHealth,
} from "../playback/episode-network-health-estimator";
import {
  getEpisodeNetworkHealth,
  resetEpisodeNetworkHealth,
  setEpisodeNetworkHealth,
  useEpisodeNetworkHealth,
} from "../playback/episode-network-health";
import { useEpisodeStartupCushionState } from "../playback/episode-startup-cushion-state";
import { EPISODE_3D_PLACEMENT_BUFFERING_DETAIL } from "../scene/placement/use-episode-3d-placement-stream";
import styles from "./EpisodeNetworkStatus.module.css";

const HEALTH_HEARTBEAT_MS = 1_000;

interface EpisodeNetworkStatusViewModel {
  readonly detail: string | null;
  readonly gaugeFillPercent: number | null;
  readonly kind: "limited" | "neutral";
  readonly label: string;
  readonly throughputLabel: string | null;
  readonly title: string;
}

/**
 * Non-visual bridge from transport snapshots and playback buffering edges into
 * the playback-local network-health atom.
 */
export const EpisodeNetworkHealthTracker: React.FC<{
  readonly playback: PlaybackReadCapability | null;
}> = ({ playback }) => {
  const store = usePlaybackStore();
  const buffering = useIsBuffering();
  const playPending = useIsPlayPending();
  const estimatorRef = useRef<ReturnType<
    typeof createEpisodeNetworkHealthEstimator
  > | null>(null);

  // This effect owns the transport subscription and heartbeat for the current
  // playback capability, resetting health when that capability is released.
  useEffect(() => {
    const subscribeTransport = playback?.subscribeTransport;
    if (!subscribeTransport) {
      return undefined;
    }

    const estimator = createEpisodeNetworkHealthEstimator();
    estimatorRef.current = estimator;
    const publish = () => {
      const previous = getEpisodeNetworkHealth(store);
      const next = estimator.evaluate(nowMs());
      if (shouldPublishEpisodeNetworkHealth(previous, next)) {
        setEpisodeNetworkHealth(store, next);
      }
    };

    const unsubscribe = subscribeTransport((sample) => {
      estimator.onTransportSample(sample, nowMs());
      publish();
    });
    const heartbeat = setInterval(publish, HEALTH_HEARTBEAT_MS);

    return () => {
      unsubscribe();
      clearInterval(heartbeat);
      estimatorRef.current = null;
      resetEpisodeNetworkHealth(store);
    };
  }, [playback, store]);

  // This effect folds playback buffering edges into the active transport
  // estimator so the displayed health reflects user-visible stalls.
  useEffect(() => {
    const estimator = estimatorRef.current;
    if (!estimator) {
      return;
    }

    estimator.setBuffering(buffering || playPending, nowMs());
    const next = estimator.evaluate(nowMs());
    if (
      shouldPublishEpisodeNetworkHealth(getEpisodeNetworkHealth(store), next)
    ) {
      setEpisodeNetworkHealth(store, next);
    }
  }, [buffering, playPending, store]);

  return null;
};

/**
 * Top-bar chip shown while buffering is attributable to constrained network
 * throughput.
 */
export const EpisodeNetworkStatusPill: React.FC = () => {
  const health = useEpisodeNetworkHealth();
  const playPending = useIsPlayPending();
  const bufferingDetail = useBufferingDetail();
  const startupCushion = useEpisodeStartupCushionState();
  const displayThroughput =
    health.busyThroughputBytesPerSec ?? health.throughputBytesPerSec;
  const throughputLabel =
    displayThroughput !== null && displayThroughput > 0
      ? `${humanReadableBytes(Math.round(displayThroughput))}/s`
      : null;
  const view = episodeNetworkStatusViewModel({
    bufferingDetail,
    healthLimited: health.limited,
    playPending,
    startupCushion,
    throughputLabel,
  });
  if (!view) {
    return null;
  }

  return (
    <span
      className={`${styles.pill} ${view.kind === "neutral" ? styles.neutral : ""}`}
      data-cy="episode-network-status-pill"
      title={view.title}
    >
      {view.gaugeFillPercent !== null ? (
        // The vessel fills with the runway actually buffered so far.
        <span aria-hidden="true" className={styles.gauge}>
          <span
            className={styles.gaugeFill}
            style={{ height: `${view.gaugeFillPercent}%` }}
          />
        </span>
      ) : (
        <span className={styles.dot} aria-hidden="true" />
      )}
      {view.label}
      {view.throughputLabel ? (
        <span className={styles.throughput}>{view.throughputLabel}</span>
      ) : null}
      {view.detail ? (
        <span className={styles.throughput}>{view.detail}</span>
      ) : null}
    </span>
  );
};

function episodeNetworkStatusViewModel({
  bufferingDetail,
  healthLimited,
  playPending,
  startupCushion,
  throughputLabel,
}: {
  readonly bufferingDetail: string | null;
  readonly healthLimited: boolean;
  readonly playPending: boolean;
  readonly startupCushion: ReturnType<typeof useEpisodeStartupCushionState>;
  readonly throughputLabel: string | null;
}): EpisodeNetworkStatusViewModel | null {
  const placementPending =
    playPending && bufferingDetail === EPISODE_3D_PLACEMENT_BUFFERING_DETAIL;
  // The bandwidth-aware start gate is holding this play press: name the
  // wait so it reads as deliberate buffering, not a hang.
  const gatedStart =
    playPending && startupCushion !== null ? startupCushion : null;
  if (!throughputLabel && !placementPending && !gatedStart) {
    return null;
  }

  const startupProgressPercent = gatedStart
    ? clampedProgressPercent(gatedStart.progressFraction)
    : null;
  const startupTargetSeconds = gatedStart
    ? Number(gatedStart.targetSeconds.toFixed(1))
    : null;

  if (placementPending) {
    return {
      detail: "waiting for transforms",
      gaugeFillPercent: gatedStart
        ? clampedProgressPercent(gatedStart.progressFraction)
        : null,
      kind: healthLimited ? "limited" : "neutral",
      label: "Placement",
      throughputLabel,
      title:
        "Playback is waiting for frame transforms needed to place the 3D point cloud.",
    };
  }

  if (gatedStart) {
    return {
      detail: `buffering ${startupProgressPercent}% of ${startupTargetSeconds}s`,
      gaugeFillPercent: clampedProgressPercent(gatedStart.progressFraction),
      kind: healthLimited ? "limited" : "neutral",
      label: healthLimited ? "Slow network" : "Preparing playback",
      throughputLabel,
      title: `Playback has buffered ${startupProgressPercent}% of its ${startupTargetSeconds}-second startup runway.`,
    };
  }

  return {
    detail: null,
    gaugeFillPercent: null,
    kind: healthLimited ? "limited" : "neutral",
    label: healthLimited ? "Slow network" : "Bandwidth",
    throughputLabel,
    title: healthLimited
      ? "Playback is buffering because the network cannot keep up with this recording's data rate."
      : "Observed episode throughput while transfers were active.",
  };
}

function clampedProgressPercent(fraction: number): number {
  return Math.round(Math.min(1, Math.max(0, fraction)) * 100);
}

function nowMs(): number {
  return globalThis.performance?.now?.() ?? Date.now();
}
