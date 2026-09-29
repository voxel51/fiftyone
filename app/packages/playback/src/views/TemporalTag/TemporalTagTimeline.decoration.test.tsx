import { cleanup, render } from "@testing-library/react";
import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Track } from "../../lib/tracks/TrackProvider";
import { TrackProvider } from "../../lib/tracks/TrackProvider";
import type { TimelineTrackProps } from "../TimelineTrack/TimelineTrack";
import type { TimelineWithTracksProps } from "../TimelineWithTracks/TimelineWithTracks";
import { temporalTagTrackId } from "./temporal-tag-tracks";
import TemporalTagTimeline from "./TemporalTagTimeline";

// The row decorator is what routes the tag actions, and `TimelineWithTracks`
// only ever calls it for rows the virtualizer has mounted — which in jsdom is
// none. Standing in for it hands the decorator straight to the test.
const captured: { decorate?: TimelineWithTracksProps["decorateTrack"] } = {};
vi.mock("../TimelineWithTracks/TimelineWithTracks", () => ({
  default: (props: TimelineWithTracksProps) => {
    captured.decorate = props.decorateTrack;
    return null;
  },
}));

// The popup reads playback state the provider would supply; nothing here
// exercises it.
vi.mock("./TemporalTagPopup", () => ({ default: () => null }));
vi.mock("./TemporalTagRangeOverlay", () => ({ default: () => null }));

const track = (id: string): Track => ({
  id,
  label: id,
  color: "#ffffff",
  events: [{ startSec: 1, endSec: 2, data: "tag-id" }],
});

function decorationFor(
  id: string,
  props: Partial<React.ComponentProps<typeof TemporalTagTimeline>> = {},
): Partial<TimelineTrackProps> {
  render(
    <TrackProvider>
      <TemporalTagTimeline
        onTagUpdate={async () => {}}
        tagEventMenuItems={[{ label: "Delete tag", onSelect: () => {} }]}
        {...props}
      />
    </TrackProvider>,
  );

  return captured.decorate?.(track(id), false) ?? {};
}

afterEach(() => {
  cleanup();
  captured.decorate = undefined;
});

describe("TemporalTagTimeline tag actions", () => {
  it("offers the tag actions on temporal-tag rows", () => {
    const decoration = decorationFor(temporalTagTrackId("review"));

    expect(decoration.eventMenuItems?.map((item) => item.label)).toEqual([
      "Edit tag",
      "Delete tag",
    ]);
  });

  it("leaves a host's own rows alone", () => {
    const decoration = decorationFor("frames.detections::instance-1");

    expect(decoration.eventMenuItems).toBeUndefined();
  });

  it("keeps the host's decoration for the rows it decorates itself", () => {
    const decoration = decorationFor(temporalTagTrackId("review"), {
      decorateTrack: () => ({ className: "host-row" }),
    });

    expect(decoration.className).toBe("host-row");
    expect(decoration.eventMenuItems).toHaveLength(2);
  });
});
