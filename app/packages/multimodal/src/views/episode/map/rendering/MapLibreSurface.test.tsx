import { cleanup, render, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { MAP_BASE_LAYER } from "./types";
import { MapLibreSurface } from "./MapLibreSurface";

const mapLibre = vi.hoisted(() => {
  const instances: MockMap[] = [];

  class MockMap {
    readonly addControl = vi.fn();
    readonly canvas = document.createElement("canvas");
    readonly getCanvas = vi.fn(() => this.canvas);
    readonly getCenter = vi.fn(() => ({ lat: 0, lng: 0 }));
    readonly getZoom = vi.fn(() => 1);
    readonly off = vi.fn();
    readonly on = vi.fn(() => this);
    readonly remove = vi.fn();
    readonly resize = vi.fn();

    constructor() {
      instances.push(this);
    }
  }

  return { instances, MockMap };
});

vi.mock("maplibre-gl", () => ({
  Map: mapLibre.MockMap,
  NavigationControl: class NavigationControl {},
}));

vi.mock("maplibre-gl/dist/maplibre-gl.css?url", () => ({
  default: "/maplibre-gl.css",
}));

afterEach(() => {
  cleanup();
  mapLibre.instances.length = 0;
});

describe("MapLibreSurface", () => {
  it("owns the map instance and playback subscription lifecycle", async () => {
    const clearHover = vi.fn();
    const unsubscribePlayhead = vi.fn();
    const playback = {
      clearHover,
      readHoverTimeNs: () => null,
      readPlayhead: () => ({ paused: true, timeNs: null }),
      subscribeHover: vi.fn(() => vi.fn()),
      subscribePlayhead: vi.fn(() => unsubscribePlayhead),
    };
    const rendered = render(
      <MapLibreSurface
        baseLayer={MAP_BASE_LAYER.NONE}
        basemapStatus="disabled"
        bounds={null}
        fitRouteNonce={0}
        followEgo={false}
        locationEvidencePending={false}
        measureArmed={false}
        measurement={null}
        onBasemapStatusChange={vi.fn()}
        onHoverTimeNs={vi.fn()}
        onMeasurePick={vi.fn()}
        onSeekTimeNs={vi.fn()}
        onUserMove={vi.fn()}
        playback={playback}
        pulseActive={false}
        recenterNonce={0}
        sourceKey="recording"
        tracks={[]}
        viewportScope={null}
      />,
    );

    await waitFor(() => expect(mapLibre.instances).toHaveLength(1));
    const map = mapLibre.instances[0];
    expect(map?.addControl).toHaveBeenCalledOnce();
    expect(map?.on).toHaveBeenCalledWith("load", expect.any(Function));
    expect(playback.subscribePlayhead).toHaveBeenCalledOnce();

    rendered.unmount();
    expect(map?.remove).toHaveBeenCalledOnce();
    expect(unsubscribePlayhead).toHaveBeenCalledOnce();
    expect(clearHover).toHaveBeenCalledOnce();
  });
});
