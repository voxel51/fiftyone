import { isPlayPendingAtom } from "@fiftyone/playback/src/lib/playback/atoms";
import {
  PlaybackProvider,
  usePlaybackStore,
} from "@fiftyone/playback/src/lib/playback/PlaybackProvider";
import { cleanup, render, screen } from "@testing-library/react";
import React, { useEffect } from "react";
import { afterEach, describe, expect, it } from "vitest";
import type { McapNetworkHealth } from "./mcap-network-health-estimator";
import { setMcapNetworkHealth } from "./mcap-network-health";
import { McapNetworkStatusPill } from "./McapNetworkStatus";
import {
  setMcapStartupCushionState,
  type McapStartupCushionState,
} from "./mcap-startup-cushion-state";

const IDLE_HEALTH: McapNetworkHealth = {
  busyFraction: 0,
  busyThroughputBytesPerSec: null,
  limited: false,
  throughputBytesPerSec: null,
  throughputPlannable: false,
  updatedAtMs: 0,
};

function NetworkStateSetup({
  health = IDLE_HEALTH,
  playPending = false,
  startupCushion = null,
}: {
  readonly health?: McapNetworkHealth;
  readonly playPending?: boolean;
  readonly startupCushion?: McapStartupCushionState | null;
}) {
  const store = usePlaybackStore();

  // This effect publishes each test case's network and startup state.
  useEffect(() => {
    store.set(isPlayPendingAtom, playPending);
    setMcapNetworkHealth(store, health);
    setMcapStartupCushionState(store, startupCushion);
  }, [health, playPending, startupCushion, store]);

  return null;
}

function renderPill(
  props: React.ComponentProps<typeof NetworkStateSetup> = {},
) {
  return render(
    <PlaybackProvider duration={10}>
      <NetworkStateSetup {...props} />
      <McapNetworkStatusPill />
    </PlaybackProvider>,
  );
}

describe("McapNetworkStatusPill", () => {
  afterEach(cleanup);

  it("shows startup coverage before the first throughput sample", () => {
    renderPill({
      playPending: true,
      startupCushion: {
        estimatedWaitSeconds: 3,
        progressFraction: 0.25,
        targetSeconds: 4,
      },
    });

    expect(screen.getByText("Preparing playback")).toBeTruthy();
    expect(screen.getByText("buffering 25% of 4s")).toBeTruthy();
  });

  it("shows active-transfer throughput instead of an idle-decayed rate", () => {
    renderPill({
      health: {
        busyFraction: 0.1,
        busyThroughputBytesPerSec: 1024 * 1024,
        limited: false,
        throughputBytesPerSec: 4,
        throughputPlannable: true,
        updatedAtMs: 1,
      },
    });

    expect(screen.getByText("1 MB/s")).toBeTruthy();
    expect(screen.queryByText("4 B/s")).toBeNull();
  });
});
