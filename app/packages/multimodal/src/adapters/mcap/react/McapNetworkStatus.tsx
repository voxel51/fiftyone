// Deep imports on purpose: the playback package root barrel pulls view
// components whose relay fragments cannot evaluate under vitest.
import { usePlaybackStore } from "@fiftyone/playback/src/lib/playback/playback-store-context";
import {
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
import styles from "./McapNetworkStatus.module.css";

const HEALTH_HEARTBEAT_MS = 1_000;

/**
 * Non-visual bridge from transport snapshots and playback buffering edges
 * into the network-health atom. Mount once per modal next to the stream
 * registration; renders nothing.
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

  // This effect owns the estimator lifetime: it subscribes to worker
  // transport snapshots (an external, non-React signal) and re-evaluates on
  // a heartbeat so a limited verdict can clear once responses stop arriving.
  useEffect(() => {
    const subscribeTransport = client?.subscribeTransport?.bind(client);
    if (!subscribeTransport) {
      return undefined;
    }

    const estimator = createMcapNetworkHealthEstimator();
    estimatorRef.current = estimator;
    const publish = () => {
      const next = estimator.evaluate(nowMs());
      if (shouldPublishMcapNetworkHealth(getMcapNetworkHealth(store), next)) {
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

  // This effect forwards playback buffering edges (engine buffering flag or
  // accepted-but-pending play intent) into the estimator's clock.
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
 * Top-bar pill shown while buffering is attributable to a slow network,
 * with the observed throughput so users can see what their link delivers.
 */
export const McapNetworkStatusPill: React.FC = () => {
  const health = useMcapNetworkHealth();
  if (!health.limited) {
    return null;
  }

  const throughputLabel =
    health.throughputBytesPerSec !== null && health.throughputBytesPerSec > 0
      ? `${humanReadableBytes(Math.round(health.throughputBytesPerSec))}/s`
      : null;

  return (
    <span
      className={styles.pill}
      data-testid="mcap-network-status-pill"
      title="Playback is buffering because the network cannot keep up with this recording's data rate."
    >
      <span className={styles.dot} aria-hidden="true" />
      Slow network
      {throughputLabel ? (
        <span className={styles.throughput}>{throughputLabel}</span>
      ) : null}
    </span>
  );
};

function nowMs(): number {
  return globalThis.performance?.now?.() ?? Date.now();
}
