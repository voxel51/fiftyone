import { act, cleanup, render, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { LocationTrackState } from "../tracks/location-track";
import { HIT_SOURCE_ID } from "./map-sources";
import { MAP_BASE_LAYER } from "./types";
import { MapLibreSurface } from "./MapLibreSurface";

const mapLibre = vi.hoisted(() => {
  const instances: MockMap[] = [];

  class MockMap {
    readonly addControl = vi.fn();
    readonly addImage = vi.fn();
    readonly addLayer = vi.fn((layer: { id: string }) => {
      this.layers.add(layer.id);
    });
    readonly addSource = vi.fn((id: string) => {
      this.sources.set(id, { setData: vi.fn() });
    });
    readonly canvas = document.createElement("canvas");
    readonly events = new Map<string, Array<(...args: unknown[]) => void>>();
    readonly getCanvas = vi.fn(() => this.canvas);
    readonly getCenter = vi.fn(() => ({ lat: 0, lng: 0 }));
    readonly getLayer = vi.fn((id: string) =>
      this.layers.has(id) ? { id } : undefined,
    );
    readonly getSource = vi.fn((id: string) => this.sources.get(id));
    readonly getZoom = vi.fn(() => 1);
    readonly hasImage = vi.fn(() => false);
    readonly isSourceLoaded = vi.fn(() => true);
    readonly jumpTo = vi.fn();
    readonly layers = new Set<string>();
    readonly off = vi.fn(
      (event: string, listener: (...args: unknown[]) => void) => {
        const listeners = this.events.get(event);
        if (!listeners) return this;
        this.events.set(
          event,
          listeners.filter((candidate) => candidate !== listener),
        );
        return this;
      },
    );
    readonly on = vi.fn(
      (
        event: string,
        layerOrListener: string | ((...args: unknown[]) => void),
        layerListener?: (...args: unknown[]) => void,
      ) => {
        const listener =
          typeof layerOrListener === "function"
            ? layerOrListener
            : layerListener;
        if (listener) {
          this.events.set(event, [...(this.events.get(event) ?? []), listener]);
        }
        return this;
      },
    );
    readonly remove = vi.fn();
    readonly resize = vi.fn();
    readonly setFilter = vi.fn();
    readonly setPaintProperty = vi.fn();
    readonly setStyle = vi.fn();
    readonly sources = new Map<string, { setData: ReturnType<typeof vi.fn> }>();
    readonly triggerRepaint = vi.fn();

    emit(event: string, ...args: unknown[]): void {
      for (const listener of this.events.get(event) ?? []) listener(...args);
    }

    constructor() {
      instances.push(this);
    }
  }

  return { instances, MockMap };
});

const basemap = vi.hoisted(() => ({
  loadStyle: vi.fn(async () => ({
    layers: [],
    sources: {
      provider: { type: "vector", url: "https://tiles.example.test" },
    },
    version: 8 as const,
  })),
}));

vi.mock("../basemap", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../basemap")>()),
  loadOpenFreeMapStyle: basemap.loadStyle,
}));

vi.mock("maplibre-gl", () => ({
  Map: mapLibre.MockMap,
  NavigationControl: class NavigationControl {},
}));

vi.mock("maplibre-gl/dist/maplibre-gl.css?url", () => ({
  default: "/maplibre-gl.css",
}));

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  mapLibre.instances.length = 0;
  basemap.loadStyle.mockClear();
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
        liveMarkers={[]}
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

  it("does not rebuild the hit source for live-marker-only changes", async () => {
    const playback = {
      clearHover: vi.fn(),
      readHoverTimeNs: () => null,
      readPlayhead: () => ({ paused: true, timeNs: 5n }),
      subscribeHover: vi.fn(() => vi.fn()),
      subscribePlayhead: vi.fn(() => vi.fn()),
    };
    const track = createTrack();
    const firstLiveMarker = {
      color: track.color,
      label: track.label,
      location: { latitude: 5, longitude: 5, timeNs: 5n },
      stream: track.stream,
    };
    const props = {
      baseLayer: MAP_BASE_LAYER.NONE,
      basemapStatus: "disabled" as const,
      bounds: null,
      fitRouteNonce: 0,
      followEgo: false,
      locationEvidencePending: false,
      measureArmed: false,
      measurement: null,
      onBasemapStatusChange: vi.fn(),
      onHoverTimeNs: vi.fn(),
      onMeasurePick: vi.fn(),
      onSeekTimeNs: vi.fn(),
      onUserMove: vi.fn(),
      playback,
      pulseActive: false,
      recenterNonce: 0,
      sourceKey: "recording",
      tracks: [track],
      viewportScope: null,
    };
    const rendered = render(
      <MapLibreSurface {...props} liveMarkers={[firstLiveMarker]} />,
    );

    await waitFor(() => expect(mapLibre.instances).toHaveLength(1));
    const map = mapLibre.instances[0];
    act(() => map?.emit("load"));
    await waitFor(() => {
      expect(map?.getSource(HIT_SOURCE_ID)?.setData).toHaveBeenCalledOnce();
    });
    const hitSetData = map?.getSource(HIT_SOURCE_ID)?.setData;

    rendered.rerender(
      <MapLibreSurface
        {...props}
        liveMarkers={[
          {
            ...firstLiveMarker,
            color: "#00ff00",
            location: { latitude: 6, longitude: 6, timeNs: 6n },
          },
        ]}
      />,
    );

    await waitFor(() => {
      expect(map?.hasImage).toHaveBeenCalledWith("episode-puck-dot-#00ff00");
    });
    expect(hitSetData).toHaveBeenCalledOnce();
  });

  it("ignores overlay errors and makes provider readiness monotonic", async () => {
    const onBasemapStatusChange = vi.fn();
    const playback = {
      clearHover: vi.fn(),
      readHoverTimeNs: () => null,
      readPlayhead: () => ({ paused: true, timeNs: null }),
      subscribeHover: vi.fn(() => vi.fn()),
      subscribePlayhead: vi.fn(() => vi.fn()),
    };
    render(
      <MapLibreSurface
        baseLayer={MAP_BASE_LAYER.DEFAULT}
        basemapStatus="loading"
        bounds={null}
        fitRouteNonce={0}
        followEgo={false}
        locationEvidencePending={false}
        liveMarkers={[]}
        measureArmed={false}
        measurement={null}
        onBasemapStatusChange={onBasemapStatusChange}
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
    act(() => map?.emit("load"));
    await waitFor(() => expect(map?.setStyle).toHaveBeenCalled());

    act(() => {
      for (let index = 0; index < 5; index += 1) {
        map?.emit("error", { sourceId: "episode-location-current" });
      }
    });
    expect(onBasemapStatusChange).not.toHaveBeenCalledWith(
      MAP_BASE_LAYER.DEFAULT,
      "error",
    );

    act(() => {
      map?.emit("sourcedata", {
        coord: {},
        sourceDataType: "content",
        sourceId: "provider",
      });
    });
    await waitFor(() => {
      expect(onBasemapStatusChange).toHaveBeenCalledWith(
        MAP_BASE_LAYER.DEFAULT,
        "ready",
      );
    });
    act(() => {
      for (let index = 0; index < 5; index += 1) {
        map?.emit("error", { sourceId: "provider" });
      }
    });

    expect(onBasemapStatusChange).not.toHaveBeenCalledWith(
      MAP_BASE_LAYER.DEFAULT,
      "error",
    );
    expect(map?.off).toHaveBeenCalledWith("error", expect.any(Function));
    expect(map?.off).toHaveBeenCalledWith("sourcedata", expect.any(Function));
    expect(map?.off).toHaveBeenCalledWith("styledata", expect.any(Function));
  });

  it("retries pre-ready failures with bounded backoff then restores local style", async () => {
    vi.useFakeTimers();
    const onBasemapStatusChange = vi.fn();
    const playback = {
      clearHover: vi.fn(),
      readHoverTimeNs: () => null,
      readPlayhead: () => ({ paused: true, timeNs: null }),
      subscribeHover: vi.fn(() => vi.fn()),
      subscribePlayhead: vi.fn(() => vi.fn()),
    };
    render(
      <MapLibreSurface
        baseLayer={MAP_BASE_LAYER.DEFAULT}
        basemapStatus="loading"
        bounds={null}
        fitRouteNonce={0}
        followEgo={false}
        locationEvidencePending={false}
        liveMarkers={[]}
        measureArmed={false}
        measurement={null}
        onBasemapStatusChange={onBasemapStatusChange}
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

    await vi.waitFor(() => expect(mapLibre.instances).toHaveLength(1));
    const map = mapLibre.instances[0];
    act(() => map?.emit("load"));
    await vi.waitFor(() => expect(map?.setStyle).toHaveBeenCalledTimes(1));

    const failAttempt = () => {
      act(() => {
        for (let index = 0; index < 3; index += 1) {
          map?.emit("error", { sourceId: "provider" });
        }
      });
    };
    failAttempt();
    await act(async () => vi.advanceTimersByTimeAsync(500));
    await vi.waitFor(() => expect(map?.setStyle).toHaveBeenCalledTimes(2));
    failAttempt();
    await act(async () => vi.advanceTimersByTimeAsync(1_500));
    await vi.waitFor(() => expect(map?.setStyle).toHaveBeenCalledTimes(3));
    failAttempt();

    expect(map?.setStyle).toHaveBeenCalledTimes(4);
    expect(map?.setStyle.mock.calls.at(-1)?.[0]).toMatchObject({
      sources: {},
      version: 8,
    });
    expect(onBasemapStatusChange).toHaveBeenCalledWith(
      MAP_BASE_LAYER.DEFAULT,
      "error",
    );
  });
});

function createTrack(): LocationTrackState {
  return {
    color: "#ff6600",
    label: "GPS",
    pointCount: 2,
    segments: [
      {
        points: [
          { latitude: 0, longitude: 0, timeNs: 0n },
          { latitude: 10, longitude: 10, timeNs: 10n },
        ],
      },
    ],
    sourceName: "/gps/fix",
    status: "ready",
    stream: "/gps",
  };
}
