// @vitest-environment jsdom
import { TrackProvider, useTrackPinning, type Track } from "@fiftyone/playback";
import { act, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { PinOnAppear } from "./PinOnAppear";

const ROW: Track = {
  id: "embedding-window::video",
  label: "video",
  color: "#fff",
  events: [],
};
const PERSIST_KEY = "pin-on-appear-test";

afterEach(() => window.localStorage.clear());

function mount() {
  const pinning: { current: ReturnType<typeof useTrackPinning> | null } = {
    current: null,
  };
  const Probe = () => {
    pinning.current = useTrackPinning();
    return null;
  };
  const tree = (ids: string[]) => (
    <TrackProvider
      tracks={[ROW]}
      autoPinNewTracks={false}
      persistKey={PERSIST_KEY}
    >
      <PinOnAppear ids={ids} />
      <Probe />
    </TrackProvider>
  );
  const view = render(tree([ROW.id]));
  return {
    pinned: () => pinning.current?.pinnedIds.has(ROW.id),
    unpin: () => act(() => pinning.current?.setPinned(ROW.id, false)),
    reappear: () => view.rerender(tree([ROW.id])),
  };
}

describe("PinOnAppear", () => {
  it("pins a row even when the sample has a stored pin set", () => {
    // A stored set is what makes the provider ignore its initial pins
    window.localStorage.setItem(PERSIST_KEY, JSON.stringify(["another-row"]));

    const { pinned } = mount();

    expect(pinned()).toBe(true);
  });

  it("leaves a row the reader unpinned alone when it appears again", () => {
    const { pinned, unpin, reappear } = mount();

    unpin();
    reappear();

    expect(pinned()).toBe(false);
  });
});
