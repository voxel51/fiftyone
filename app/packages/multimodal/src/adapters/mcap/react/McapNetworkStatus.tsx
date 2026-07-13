// Deep imports on purpose: the playback package root barrel pulls view
// components whose relay fragments cannot evaluate under vitest.
import { usePlaybackStore } from "@fiftyone/playback/src/lib/playback/playback-store-context";
import {
  useBufferingDetail,
  useIsBuffering,
  useIsPlayPending,
} from "@fiftyone/playback/src/lib/playback/use-playback-state";
import { humanReadableBytes } from "@fiftyone/utilities";
import React, { useEffect, useRef } from "react";
import type { McapResourceClient } from "../types";
import {
  createMcapNetworkHealthEstimator,
  shouldPublishMcapNetworkHealth,
} from "./mcap-network-health-estimator";
import {
  getMcapNetworkHealth,
  resetMcapNetworkHealth,
  setMcapNetworkHealth,
  useMcapNetworkHealth,
} from "./mcap-network-health";
import { useMcapStartupCushionState } from "./mcap-startup-cushion-state";
import { MCAP_3D_PLACEMENT_BUFFERING_DETAIL } from "./use-mcap-3d-placement-stream";
import styles from "./McapNetworkStatus.module.css";

const HEALTH_HEARTBEAT_MS = 1_000;

/**
 * Non-visual bridge from transport snapshots and playback buffering edges into
 * the playback-local network-health atom.
 */
export const McapNetworkHealthTracker: React.FC<{
  readonly client: McapResourceClient | null;
}> = ({ client }) => {
  const store = usePlaybackStore();
  const buffering = useIsBuffering();
  const playPending = useIsPlayPending();
  const estimatorRef = useRef<ReturnType<
    typeof createMcapNetworkHealthEstimator
  > | null>(null);

  useEffect(() => {
    const subscribeTransport = client?.subscribeTransport?.bind(client);
    if (!subscribeTransport) {
      return undefined;
    }

    const estimator = createMcapNetworkHealthEstimator();
    estimatorRef.current = estimator;
    const publish = () => {
      const previous = getMcapNetworkHealth(store);
      const next = estimator.evaluate(nowMs());
      if (shouldPublishMcapNetworkHealth(previous, next)) {
        setMcapNetworkHealth(store, next);
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
      resetMcapNetworkHealth(store);
    };
  }, [client, store]);

  useEffect(() => {
    const estimator = estimatorRef.current;
    if (!estimator) {
      return;
    }

    estimator.setBuffering(buffering || playPending, nowMs());
    const next = estimator.evaluate(nowMs());
    if (shouldPublishMcapNetworkHealth(getMcapNetworkHealth(store), next)) {
      setMcapNetworkHealth(store, next);
    }
  }, [buffering, playPending, store]);

  return null;
};

/**
 * Top-bar chip shown while buffering is attributable to constrained network
 * throughput.
 */
export const McapNetworkStatusPill: React.FC = () => {
  const health = useMcapNetworkHealth();
  const playPending = useIsPlayPending();
  const bufferingDetail = useBufferingDetail();
  const startupCushion = useMcapStartupCushionState();
  const displayThroughput =
    health.busyThroughputBytesPerSec ?? health.throughputBytesPerSec;
  const throughputLabel =
    displayThroughput !== null && displayThroughput > 0
      ? `${humanReadableBytes(Math.round(displayThroughput))}/s`
      : null;
  const placementPending =
    playPending && bufferingDetail === MCAP_3D_PLACEMENT_BUFFERING_DETAIL;
  // The bandwidth-aware start gate is holding this play press: name the
  // wait so it reads as deliberate buffering, not a hang.
  const gatedStart =
    playPending && startupCushion !== null ? startupCushion : null;
  if (!throughputLabel && !placementPending && !gatedStart) {
    return null;
  }

  const bufferingLabel = placementPending
    ? "waiting for transforms"
    : gatedStart
      ? `buffering ${Math.round(gatedStart.progressFraction * 100)}% of ${Number(
          gatedStart.targetSeconds.toFixed(1),
        )}s`
      : null;
  const label = placementPending
    ? "Placement"
    : gatedStart
      ? health.limited
        ? "Slow network"
        : "Preparing playback"
      : health.limited
        ? "Slow network"
        : "Bandwidth";

  return (
    <span
      className={`${styles.pill} ${health.limited ? "" : styles.neutral}`}
      data-cy="mcap-network-status-pill"
      title={
        placementPending
          ? "Playback is waiting for frame transforms needed to place the 3D point cloud."
          : gatedStart
            ? `Playback has buffered ${Math.round(
                gatedStart.progressFraction * 100,
              )}% of its ${Number(
                gatedStart.targetSeconds.toFixed(1),
              )}-second startup runway.`
            : health.limited
              ? "Playback is buffering because the network cannot keep up with this recording's data rate."
              : "Observed MCAP throughput while transfers were active."
      }
    >
      {gatedStart ? (
        // The vessel fills with the runway actually buffered so far.
        <span aria-hidden="true" className={styles.gauge}>
          <span
            className={styles.gaugeFill}
            style={{
              height: `${Math.round(
                Math.min(1, Math.max(0, gatedStart.progressFraction)) * 100,
              )}%`,
            }}
          />
        </span>
      ) : (
        <span className={styles.dot} aria-hidden="true" />
      )}
      {label}
      {throughputLabel ? (
        <span className={styles.throughput}>{throughputLabel}</span>
      ) : null}
      {bufferingLabel ? (
        <span className={styles.throughput}>{bufferingLabel}</span>
      ) : null}
    </span>
  );
};

function nowMs(): number {
  return globalThis.performance?.now?.() ?? Date.now();
}
