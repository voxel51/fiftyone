/**
 * `usePairing`: the polling loop's pacing and its stop conditions.
 */

import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ConnectionStatus, PollStatus } from "../../types";
import { SLOW_DOWN_BACKOFF_S, usePairing } from "../usePairing";
import { fakePanelMethods, FakePanelMethods } from "./fakes";

const URLS = {
  api_url: "https://api.example.com",
  auth_url: "https://auth.example.com/cas/api",
};

const STARTED = {
  device_code: "dev-1",
  user_code: "WDJB-MJHT",
  verification_uri: "https://cloud.example.com/activate",
  verification_uri_complete: "https://cloud.example.com/activate?c=WDJB",
  expires_at: new Date(Date.now() + 600_000).toISOString(),
  expires_in: 600,
  interval: 5,
};

function polls(methods: FakePanelMethods) {
  return methods.calls.filter((call) => call.method === "pollPairing");
}

/** Advances fake timers and lets the awaited poll settle. */
async function advance(seconds: number) {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(seconds * 1000);
  });
}

function render(methods: FakePanelMethods) {
  return renderHook(() => usePairing(methods, ConnectionStatus.Pairing));
}

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("usePairing", () => {
  it("polls at the interval the server asked for", async () => {
    const methods = fakePanelMethods();
    methods.reply("startPairing", STARTED);
    for (let index = 0; index < 3; index++) {
      methods.reply("pollPairing", { status: PollStatus.Pending });
    }
    const { result } = render(methods);

    await act(async () => {
      await result.current.begin(URLS);
    });

    expect(polls(methods)).toHaveLength(0);
    await advance(5);
    expect(polls(methods)).toHaveLength(1);
    await advance(5);
    expect(polls(methods)).toHaveLength(2);
    // The code the server issued rides on every poll and nothing else.
    expect(polls(methods)[0].params).toEqual({
      device_code: "dev-1",
      ...URLS,
    });
  });

  it("backs off by five seconds on slow_down", async () => {
    const methods = fakePanelMethods();
    methods.reply("startPairing", STARTED);
    methods.reply("pollPairing", { status: PollStatus.SlowDown });
    methods.reply("pollPairing", { status: PollStatus.Pending });
    const { result } = render(methods);

    await act(async () => {
      await result.current.begin(URLS);
    });

    await advance(5);
    expect(polls(methods)).toHaveLength(1);

    await advance(5);
    expect(polls(methods)).toHaveLength(1);
    await advance(SLOW_DOWN_BACKOFF_S);
    expect(polls(methods)).toHaveLength(2);
  });

  it.each([PollStatus.Issued, PollStatus.Expired, PollStatus.Denied])(
    "stops polling on %s",
    async (status) => {
      const methods = fakePanelMethods();
      methods.reply("startPairing", STARTED);
      methods.reply("pollPairing", { status });
      const { result } = render(methods);

      await act(async () => {
        await result.current.begin(URLS);
      });

      await advance(5);
      expect(polls(methods)).toHaveLength(1);

      await advance(60);
      expect(polls(methods)).toHaveLength(1);
    },
  );

  it("keeps polling through an unavailable answer", async () => {
    const methods = fakePanelMethods();
    methods.reply("startPairing", STARTED);
    methods.reply("pollPairing", { status: PollStatus.Unavailable });
    methods.reply("pollPairing", { status: PollStatus.Pending });
    const { result } = render(methods);

    await act(async () => {
      await result.current.begin(URLS);
    });

    await advance(5);
    await advance(5);

    // A transport blip must not kill a pairing the user is still staring at.
    expect(polls(methods)).toHaveLength(2);
  });

  it("never exposes the device code", async () => {
    const methods = fakePanelMethods();
    methods.reply("startPairing", STARTED);
    const { result } = render(methods);

    await act(async () => {
      await result.current.begin(URLS);
    });

    expect(JSON.stringify(Object.keys(result.current))).not.toContain("device");
    expect(JSON.stringify(result.current)).not.toContain("dev-1");
  });

  it("stops polling on cancel", async () => {
    const methods = fakePanelMethods();
    methods.reply("startPairing", STARTED);
    methods.reply("pollPairing", { status: PollStatus.Pending });
    const { result } = render(methods);

    await act(async () => {
      await result.current.begin(URLS);
    });
    await act(async () => {
      await result.current.cancel();
    });

    await advance(30);

    expect(polls(methods)).toHaveLength(0);
    expect(methods.calls.some((call) => call.method === "cancelPairing")).toBe(
      true,
    );
  });

  it("stops polling on unmount", async () => {
    const methods = fakePanelMethods();
    methods.reply("startPairing", STARTED);
    methods.reply("pollPairing", { status: PollStatus.Pending });
    const { result, unmount } = render(methods);

    await act(async () => {
      await result.current.begin(URLS);
    });
    unmount();

    await advance(30);

    expect(polls(methods)).toHaveLength(0);
  });

  it("stops polling when the connection leaves pairing", async () => {
    const methods = fakePanelMethods();
    methods.reply("startPairing", STARTED);
    methods.reply("pollPairing", { status: PollStatus.Pending });
    const { result, rerender } = renderHook(
      ({ status }: { status: ConnectionStatus }) => usePairing(methods, status),
      { initialProps: { status: ConnectionStatus.Pairing } },
    );

    await act(async () => {
      await result.current.begin(URLS);
    });

    // A pairing cancelled from another tab lands here as a status change.
    rerender({ status: ConnectionStatus.Disconnected });
    await advance(30);

    expect(polls(methods)).toHaveLength(0);
  });
});
