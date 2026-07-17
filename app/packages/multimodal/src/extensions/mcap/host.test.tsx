/* eslint-disable react/prop-types */
import type { Track } from "@fiftyone/playback";
import type { SampleRendererProps } from "@fiftyone/plugins";
import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  MCAP_ACTIVE_TIMELINE,
  type McapResourceClient,
  type McapTimelineRange,
} from "../../adapters/mcap";
import {
  publishMcapSourceBootstrap,
  resetMcapSourceBootstrapCacheForTests,
} from "../../adapters/mcap/source-bootstrap-cache";
import type { ByteSourceDescriptor } from "../../query/bytes";
import { McapTimelineExtensionHost } from "./host";
import {
  registerMcapTimelineExtension,
  resetMcapTimelineExtensionsForTests,
} from "./registry";
import type { McapTimelineExtension } from "./types";

const TAG_TRACK: Track = {
  id: "temporal-tag::one",
  label: "Tag",
  color: "#000",
  events: [],
};
const EVENT_TRACK: Track = {
  id: "test-event::one",
  label: "Event",
  color: "#111",
  events: [],
};
const CLIENT = {} as McapResourceClient;
const CTX = {} as SampleRendererProps["ctx"];

afterEach(() => {
  cleanup();
  resetMcapTimelineExtensionsForTests();
  resetMcapSourceBootstrapCacheForTests();
});

describe("MCAP timeline extension host", () => {
  it("keeps the OSS-only path functional with no registration", () => {
    renderHost();
    expect(screen.getByTestId("tracks").textContent).toBe("Tag");
    expect(screen.queryByTestId("runtime")).toBeNull();
  });

  it("composes a fake extension by explicit section order", () => {
    const extension: McapTimelineExtension = {
      id: "test:events",
      order: 10,
      Component: ({ children, selectedAnnotationTopics, timelineRange }) => (
        <>
          {children({
            sections: [
              {
                id: "test:events",
                label: "Events",
                order: 100,
                tracks: [EVENT_TRACK],
              },
            ],
            preferences: {
              drawerMaxSize: 480,
              drawerSizeStorageKey: "test:drawer-size",
              labelWidthStorageKey: "test:label-width",
              timelineSearchEnabled: true,
            },
            runtime: <span data-testid="runtime">runtime</span>,
          })}
          <span data-testid="context">
            {JSON.stringify({ selectedAnnotationTopics, timelineRange })}
          </span>
        </>
      ),
    };
    registerMcapTimelineExtension(extension);

    renderHost();
    expect(screen.getByTestId("tracks").textContent).toBe(
      "Events|Event|Temporal tags|Tag",
    );
    expect(screen.getByTestId("max-size").textContent).toBe("480");
    expect(screen.getByTestId("drawer-size-key").textContent).toBe(
      "test:drawer-size",
    );
    expect(screen.getByTestId("label-width-key").textContent).toBe(
      "test:label-width",
    );
    expect(screen.getByTestId("search-enabled").textContent).toBe("true");
    expect(screen.getByTestId("runtime").textContent).toBe("runtime");
    expect(screen.getByTestId("context").textContent).toBe(
      '{"selectedAnnotationTopics":[],"timelineRange":null}',
    );
  });

  it("rejects duplicate and unnamespaced extension ids", () => {
    const extension: McapTimelineExtension = {
      id: "test:one",
      order: 1,
      Component: ({ children }) => <>{children({})}</>,
    };
    registerMcapTimelineExtension(extension);
    expect(() => registerMcapTimelineExtension(extension)).not.toThrow();
    expect(() => registerMcapTimelineExtension({ ...extension })).toThrowError(
      "Duplicate MCAP timeline extension id: test:one",
    );
    expect(() =>
      registerMcapTimelineExtension({ ...extension, id: "missing-namespace" }),
    ).toThrowError(
      "MCAP timeline extension ids must be namespaced: missing-namespace",
    );
  });

  it("prefers a source bootstrap range over a client read", () => {
    const source = createSource("cached");
    const range = createRange(10n, 20n);
    publishMcapSourceBootstrap(source, { timelineRange: range });
    const readTimelineRange = vi.fn(async () => createRange(0n, 1n));
    registerRangeProbe();

    renderHost({
      client: { readTimelineRange } as unknown as McapResourceClient,
      source,
    });

    expect(screen.getByTestId("timeline-range").textContent).toBe("10:20");
    expect(readTimelineRange).not.toHaveBeenCalled();
  });

  it("invalidates a bootstrap range when rewritten content has a new etag", async () => {
    const initial = createSource("rewritten", "etag-a");
    const replacement = createSource("rewritten", "etag-b");
    publishMcapSourceBootstrap(initial, {
      timelineRange: createRange(10n, 20n),
    });
    const readTimelineRange = vi.fn(async () => createRange(30n, 40n));
    const client = { readTimelineRange } as unknown as McapResourceClient;
    registerRangeProbe();

    const view = renderHost({ client, source: initial });
    expect(screen.getByTestId("timeline-range").textContent).toBe("10:20");

    view.rerender(hostElement({ client, source: replacement }));
    expect(screen.getByTestId("timeline-range").textContent).toBe("none");
    await waitFor(() =>
      expect(screen.getByTestId("timeline-range").textContent).toBe("30:40"),
    );
    expect(readTimelineRange).toHaveBeenCalledWith({
      activeTimeline: MCAP_ACTIVE_TIMELINE.LOG,
      source: replacement,
    });
  });

  it("falls back to resolving the range from the client", async () => {
    const source = createSource("fallback");
    const readTimelineRange = vi.fn(async () => createRange(30n, 40n));
    registerRangeProbe();

    renderHost({
      client: { readTimelineRange } as unknown as McapResourceClient,
      source,
    });

    await waitFor(() =>
      expect(screen.getByTestId("timeline-range").textContent).toBe("30:40"),
    );
    expect(readTimelineRange).toHaveBeenCalledWith({
      activeTimeline: MCAP_ACTIVE_TIMELINE.LOG,
      source,
    });
  });

  it("suppresses a stale range when the source changes", async () => {
    const first = deferred<McapTimelineRange>();
    const second = deferred<McapTimelineRange>();
    const firstSource = createSource("first");
    const secondSource = createSource("second");
    const readTimelineRange = vi.fn(
      ({ source }: { readonly source: ByteSourceDescriptor }) =>
        source.sourceId === firstSource.sourceId
          ? first.promise
          : second.promise,
    );
    registerRangeProbe();

    const view = renderHost({
      client: { readTimelineRange } as unknown as McapResourceClient,
      source: firstSource,
    });
    view.rerender(
      hostElement({
        client: { readTimelineRange } as unknown as McapResourceClient,
        source: secondSource,
      }),
    );

    await act(async () => second.resolve(createRange(50n, 60n)));
    await waitFor(() =>
      expect(screen.getByTestId("timeline-range").textContent).toBe("50:60"),
    );
    await act(async () => first.resolve(createRange(1n, 2n)));
    expect(screen.getByTestId("timeline-range").textContent).toBe("50:60");
  });
});

function renderHost(options: HostOptions = {}) {
  return render(hostElement(options));
}

interface HostOptions {
  readonly client?: McapResourceClient;
  readonly source?: ByteSourceDescriptor | null;
}

function hostElement({ client = CLIENT, source = null }: HostOptions = {}) {
  return (
    <McapTimelineExtensionHost
      builtInSections={[
        {
          id: "fiftyone:temporal-tags",
          label: "Temporal tags",
          order: 200,
          tracks: [TAG_TRACK],
        },
      ]}
      client={client}
      ctx={CTX}
      layoutScopeKey="dataset"
      navigationPending={false}
      source={source}
    >
      {({ preferences, runtime, tracks }) => (
        <>
          <span data-testid="tracks">
            {tracks.map((track) => track.label).join("|")}
          </span>
          <span data-testid="max-size">
            {String(preferences.drawerMaxSize)}
          </span>
          <span data-testid="drawer-size-key">
            {preferences.drawerSizeStorageKey}
          </span>
          <span data-testid="label-width-key">
            {preferences.labelWidthStorageKey}
          </span>
          <span data-testid="search-enabled">
            {String(preferences.timelineSearchEnabled)}
          </span>
          {runtime}
        </>
      )}
    </McapTimelineExtensionHost>
  );
}

function registerRangeProbe() {
  registerMcapTimelineExtension({
    id: "test:range",
    order: 1,
    Component: ({ children, timelineRange }) => (
      <>
        {children({})}
        <span data-testid="timeline-range">
          {timelineRange
            ? `${timelineRange.startTimeNs}:${timelineRange.endTimeNs}`
            : "none"}
        </span>
      </>
    ),
  });
}

function createSource(sourceId: string, etag?: string): ByteSourceDescriptor {
  return { sourceId, url: `memory://${sourceId}.mcap`, etag };
}

function createRange(
  startTimeNs: bigint,
  endTimeNs: bigint,
): McapTimelineRange {
  return {
    activeTimeline: MCAP_ACTIVE_TIMELINE.LOG,
    endTimeNs,
    startTimeNs,
  };
}

function deferred<Value>() {
  let resolve!: (value: Value) => void;
  const promise = new Promise<Value>((resolvePromise) => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
}
