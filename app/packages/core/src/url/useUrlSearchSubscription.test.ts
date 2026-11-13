import { getEventBus } from "@fiftyone/events";
import { act, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  patchHistoryOnce,
  URL_CHANGED_EVENT,
  useUrlSearch,
  writeUrlSearch,
  type UrlEvents,
} from "./useUrlSearchSubscription";

describe("URL change events", () => {
  afterEach(() => {
    window.history.replaceState(null, "", "/");
  });

  it("sends a URL change on the bus for each push and replace", () => {
    patchHistoryOnce();
    const changed = vi.fn();
    const off = getEventBus<UrlEvents>().on(URL_CHANGED_EVENT, changed);

    window.history.pushState(null, "", "/?a=1");
    window.history.replaceState(null, "", "/?a=2");
    off();

    expect(changed).toHaveBeenCalledTimes(2);
  });

  it("re-reads the search string on a URL change", () => {
    const { result } = renderHook(() => useUrlSearch());
    expect(result.current).toBe("");

    act(() => writeUrlSearch("view=1"));

    expect(result.current).toBe("?view=1");
  });

  it("stops listening when unmounted", () => {
    const { result, unmount } = renderHook(() => useUrlSearch());
    unmount();

    writeUrlSearch("view=2");

    expect(result.current).toBe("");
  });
});
