/* eslint-disable react/prop-types */
import type { Track } from "@fiftyone/playback";
import type { SampleRendererProps } from "@fiftyone/plugins";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { TimelineExtensionHost } from "./host";
import {
  registerTimelineExtension,
  resetTimelineExtensionsForTests,
} from "./registry";
import type { TimelineExtension } from "./types";

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
const CTX = {} as SampleRendererProps["ctx"];

afterEach(() => {
  cleanup();
  resetTimelineExtensionsForTests();
});

describe("timeline extension host", () => {
  it("keeps the built-in timeline functional with no registration", () => {
    renderHost();
    expect(screen.getByTestId("tracks").textContent).toBe("Tag");
    expect(screen.queryByTestId("runtime")).toBeNull();
  });

  it("composes a fake extension by explicit section order", () => {
    const extension: TimelineExtension = {
      id: "test:events",
      order: 10,
      Component: ({ children, selectedAnnotationStreams, timeRange }) => (
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
            {JSON.stringify({ selectedAnnotationStreams, timeRange })}
          </span>
        </>
      ),
    };
    registerTimelineExtension(extension);

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
      '{"selectedAnnotationStreams":[],"timeRange":null}',
    );
  });

  it("rejects duplicate and unnamespaced extension ids", () => {
    const extension: TimelineExtension = {
      id: "test:one",
      order: 1,
      Component: ({ children }) => <>{children({})}</>,
    };
    registerTimelineExtension(extension);
    expect(() => registerTimelineExtension(extension)).not.toThrow();
    expect(() => registerTimelineExtension({ ...extension })).toThrowError(
      "Duplicate timeline extension id: test:one",
    );
    expect(() =>
      registerTimelineExtension({ ...extension, id: "missing-namespace" }),
    ).toThrowError(
      "Timeline extension ids must be namespaced: missing-namespace",
    );
  });
});

function renderHost() {
  return render(hostElement());
}

function hostElement() {
  return (
    <TimelineExtensionHost
      builtInSections={[
        {
          id: "fiftyone:temporal-tags",
          label: "Temporal tags",
          order: 200,
          tracks: [TAG_TRACK],
        },
      ]}
      ctx={CTX}
      layoutScopeKey="dataset"
      navigationPending={false}
      timeRange={null}
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
    </TimelineExtensionHost>
  );
}
