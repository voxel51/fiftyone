import {
  bufferingDetailAtom,
  isPlayPendingAtom,
} from "@fiftyone/playback/runtime";
import { PlaybackProvider, usePlaybackStore } from "@fiftyone/playback/runtime";
import { cleanup, render, screen } from "@testing-library/react";
import React, { useEffect } from "react";
import { afterEach, describe, expect, it } from "vitest";
import type { NetworkHealth } from "../playback/network-health-estimator";
import { setNetworkHealth } from "../playback/network-health";
import { NetworkStatusPill } from "./NetworkStatus";
import {
  setStartupCushionState,
  type StartupCushionState,
} from "../playback/startup-cushion-state";
import { SCENE_3D_PLACEMENT_BUFFERING_DETAIL } from "../scene/placement/use-scene-3d-placement-stream";

const IDLE_HEALTH: NetworkHealth = {
  busyFraction: 0,
  busyThroughputBytesPerSec: null,
  limited: false,
  throughputBytesPerSec: null,
  throughputPlannable: false,
  updatedAtMs: 0,
};

function NetworkStateSetup({
  bufferingDetail = null,
  health = IDLE_HEALTH,
  playPending = false,
  startupCushion = null,
}: {
  readonly bufferingDetail?: string | null;
  readonly health?: NetworkHealth;
  readonly playPending?: boolean;
  readonly startupCushion?: StartupCushionState | null;
}) {
  const store = usePlaybackStore();

  // This effect publishes each test case's network and startup state.
  useEffect(() => {
    store.set(bufferingDetailAtom, bufferingDetail);
    store.set(isPlayPendingAtom, playPending);
    setNetworkHealth(store, health);
    setStartupCushionState(store, startupCushion);
  }, [bufferingDetail, health, playPending, startupCushion, store]);

  return null;
}

function renderPill(
  props: React.ComponentProps<typeof NetworkStateSetup> = {},
) {
  return render(
    <PlaybackProvider duration={10}>
      <NetworkStateSetup {...props} />
      <NetworkStatusPill />
    </PlaybackProvider>,
  );
}

describe("NetworkStatusPill", () => {
  afterEach(cleanup);

  it("stays hidden without throughput or a pending startup condition", () => {
    const { container } = renderPill();

    expect(
      container.querySelector('[data-cy="episode-network-status-pill"]'),
    ).toBe(null);
  });

  it("prioritizes placement waits over startup and network state", () => {
    renderPill({
      bufferingDetail: SCENE_3D_PLACEMENT_BUFFERING_DETAIL,
      health: { ...IDLE_HEALTH, limited: true },
      playPending: true,
      startupCushion: {
        estimatedWaitSeconds: 3,
        progressFraction: 0.25,
        targetSeconds: 4,
      },
    });

    const placementPill = screen.getByText("Placement");
    expect(placementPill.getAttribute("title")).toBe(
      "Playback is waiting for frame transforms needed to place the 3D point cloud.",
    );
    expect(
      placementPill.querySelector<HTMLElement>('[style*="height: 25%"]')?.style
        .height,
    ).toBe("25%");
    expect(screen.getByText("waiting for transforms")).toBeTruthy();
  });

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

  it("clamps completed startup coverage to the gauge range", () => {
    renderPill({
      playPending: true,
      startupCushion: {
        estimatedWaitSeconds: 0,
        progressFraction: 1.25,
        targetSeconds: 4,
      },
    });

    const pill = screen.getByText("Preparing playback");
    expect(pill.getAttribute("title")).toBe(
      "Playback has buffered 100% of its 4-second startup runway.",
    );
    expect(screen.getByText("buffering 100% of 4s")).toBeTruthy();
    expect(
      pill.querySelector<HTMLElement>('[style*="height: 100%"]')?.style.height,
    ).toBe("100%");
  });

  it("uses the limited-network label during gated startup", () => {
    renderPill({
      health: { ...IDLE_HEALTH, limited: true },
      playPending: true,
      startupCushion: {
        estimatedWaitSeconds: 3,
        progressFraction: 0.25,
        targetSeconds: 4,
      },
    });

    expect(screen.getByText("Slow network")).toBeTruthy();
    expect(screen.getByText("buffering 25% of 4s")).toBeTruthy();
  });

  it("shows limited throughput outside startup", () => {
    renderPill({
      health: {
        ...IDLE_HEALTH,
        limited: true,
        throughputBytesPerSec: 1024,
      },
    });

    expect(screen.getByText("Slow network").getAttribute("title")).toBe(
      "Playback is buffering because the network cannot keep up with this recording's data rate.",
    );
    expect(screen.getByText("1 KB/s")).toBeTruthy();
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
    expect(screen.getByText("Bandwidth")).toBeTruthy();
    expect(screen.queryByText("4 B/s")).toBeNull();
  });
});
