import { act, cleanup, render, screen } from "@testing-library/react";
import { createStore, Provider } from "jotai";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { APP_COUNT_SETTLE_MS } from "../sharedSession/hooks";
import { appCountAtom } from "../sharedSession/model/atoms";

const mode = vi.hoisted(() => ({ polling: false, stateless: false }));

vi.mock("@fiftyone/utilities", () => ({
  env: () => ({ VITE_NO_STATE: mode.stateless }),
  isEventSourcePolling: () => mode.polling,
}));

import SharedSessionBanner from "./SharedSessionBanner";

let store: ReturnType<typeof createStore>;

const setup = (count: number | null) => {
  store = createStore();
  store.set(appCountAtom, count);
  render(
    <Provider store={store}>
      <SharedSessionBanner />
    </Provider>,
  );
};

const report = (count: number | null) =>
  act(() => store.set(appCountAtom, count));

const wait = (ms: number) => act(() => vi.advanceTimersByTime(ms));

const banner = () => screen.queryByRole("status");

describe("SharedSessionBanner", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
    vi.unstubAllGlobals();
    mode.polling = false;
    mode.stateless = false;
  });

  it("stays hidden while this App is the only client", () => {
    setup(1);
    wait(APP_COUNT_SETTLE_MS * 2);

    expect(banner()).toBeNull();
  });

  it("warns once another client has stayed connected", () => {
    setup(1);
    report(2);
    wait(APP_COUNT_SETTLE_MS - 1);
    expect(banner()).toBeNull();

    wait(1);
    expect(banner()?.textContent).toContain("Open in 2 tabs");
  });

  it("follows the count while it warns", () => {
    setup(2);
    wait(APP_COUNT_SETTLE_MS);
    report(3);
    wait(APP_COUNT_SETTLE_MS);

    expect(banner()?.textContent).toContain("Open in 3 tabs");
  });

  it("does not flash for a reload's overlapping connections", () => {
    setup(1);
    // the old connection is seen to close shortly after the new one opens
    report(2);
    wait(300);
    expect(banner()).toBeNull();

    report(1);
    wait(APP_COUNT_SETTLE_MS * 2);
    expect(banner()).toBeNull();
  });

  it("stays up while another tab reloads", () => {
    setup(2);
    wait(APP_COUNT_SETTLE_MS);

    report(1);
    wait(500);
    expect(banner()).not.toBeNull();

    report(2);
    wait(APP_COUNT_SETTLE_MS * 2);
    expect(banner()).not.toBeNull();
  });

  it("hides once only this client remains", () => {
    setup(2);
    wait(APP_COUNT_SETTLE_MS);

    report(1);
    wait(APP_COUNT_SETTLE_MS - 1);
    expect(banner()).not.toBeNull();

    wait(1);
    expect(banner()).toBeNull();
  });

  it("hides at once when this client disconnects", () => {
    setup(2);
    wait(APP_COUNT_SETTLE_MS);

    report(null);
    expect(banner()).toBeNull();
  });

  it.each([
    ["the stateless App", () => (mode.stateless = true)],
    ["a polling event source", () => (mode.polling = true)],
    ["e2e runs", () => vi.stubGlobal("IS_PLAYWRIGHT", true)],
  ])("never shows for %s", (_, configure) => {
    configure();
    setup(2);
    wait(APP_COUNT_SETTLE_MS * 2);

    expect(banner()).toBeNull();
  });
});
