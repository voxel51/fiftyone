import { act, cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { useOptionalPlayhead } from "./use-optional-playhead";

const playback = vi.hoisted(() => ({
  callback: null as (() => void) | null,
  seconds: 0,
  store: {},
  subscribe: vi.fn((_: unknown, callback: () => void) => {
    playback.callback = callback;
    return () => {
      playback.callback = null;
    };
  }),
}));

vi.mock("@fiftyone/playback", () => ({
  getPlayhead: () => playback.seconds,
  subscribePlayhead: playback.subscribe,
  usePlaybackStore: () => playback.store,
}));

afterEach(() => {
  cleanup();
  playback.callback = null;
  playback.seconds = 0;
  playback.subscribe.mockClear();
});

describe("useOptionalPlayhead", () => {
  it("samples without subscribing when RAF updates are disabled", () => {
    const { rerender, getByTestId } = render(<Probe subscribed={false} />);

    expect(getByTestId("playhead").textContent).toBe("0");
    expect(playback.subscribe).not.toHaveBeenCalled();

    playback.seconds = 2;
    rerender(<Probe subscribed={false} />);
    expect(getByTestId("playhead").textContent).toBe("2");
    expect(playback.subscribe).not.toHaveBeenCalled();
  });

  it("reacts to playhead updates when RAF updates are enabled", () => {
    const { getByTestId } = render(<Probe subscribed />);
    expect(playback.subscribe).toHaveBeenCalledTimes(1);

    act(() => {
      playback.seconds = 3;
      playback.callback?.();
    });

    expect(getByTestId("playhead").textContent).toBe("3");
  });
});

function Probe({ subscribed }: { readonly subscribed: boolean }) {
  const playhead = useOptionalPlayhead(subscribed);
  return <span data-testid="playhead">{playhead}</span>;
}
