/**
 * Unit tests for `useSchemaManagerUrl`.
 *
 * Exercises both directions of the URL ⇄ atom sync against the shared
 * `useUrlSearchSubscription` primitive and a mocked `useSchemaManagerModal`.
 */

import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const openSchemaManager = vi.fn();
const closeSchemaManager = vi.fn();
const useSchemaManagerModalMock = vi.fn();

vi.mock("../components/Modal/Sidebar/Annotate/SchemaManager/hooks", () => ({
  useSchemaManagerModal: () => useSchemaManagerModalMock(),
}));

import {
  SCHEMA_MANAGER_QUERY_PARAM,
  SCHEMA_MANAGER_QUERY_VALUE,
  useSchemaManagerUrl,
} from "./useSchemaManagerUrl";
import { URL_CHANGED_EVENT } from "./useUrlSearchSubscription";

const setSearch = (qs: string) => {
  // jsdom lets us pushState; we go through it so subscribers fire.
  const path = window.location.pathname;
  window.history.replaceState(window.history.state, "", `${path}${qs}`);
};

const stubModal = (displayed: boolean) => {
  useSchemaManagerModalMock.mockReturnValue({
    schemaManagerDisplayed: displayed,
    openSchemaManager,
    closeSchemaManager,
  });
};

describe("useSchemaManagerUrl", () => {
  beforeEach(() => {
    openSchemaManager.mockReset();
    closeSchemaManager.mockReset();
    useSchemaManagerModalMock.mockReset();
    setSearch("");
  });

  afterEach(() => {
    setSearch("");
  });

  it("opens the modal on mount when URL has ?schemaManager=open", () => {
    setSearch(`?${SCHEMA_MANAGER_QUERY_PARAM}=${SCHEMA_MANAGER_QUERY_VALUE}`);
    stubModal(false);

    renderHook(() => useSchemaManagerUrl());

    expect(openSchemaManager).toHaveBeenCalledTimes(1);
    expect(closeSchemaManager).not.toHaveBeenCalled();
  });

  it("does not call open/close on mount when URL and atom already agree", () => {
    setSearch("");
    stubModal(false);

    renderHook(() => useSchemaManagerUrl());

    expect(openSchemaManager).not.toHaveBeenCalled();
    expect(closeSchemaManager).not.toHaveBeenCalled();
  });

  it("closes the modal on mount when URL lacks the param but atom is displayed", () => {
    setSearch("");
    stubModal(true);

    renderHook(() => useSchemaManagerUrl());

    expect(closeSchemaManager).toHaveBeenCalledTimes(1);
  });

  it("writes the param to the URL when the atom transitions to true", () => {
    setSearch("?id=abc");
    stubModal(false);

    const { rerender } = renderHook(() => useSchemaManagerUrl());

    // Mount with atom=false should NOT touch the URL (URL is authority on mount).
    expect(window.location.search).not.toContain(SCHEMA_MANAGER_QUERY_PARAM);

    // Now flip atom to true (simulate openSchemaManager()).
    act(() => {
      stubModal(true);
      rerender();
    });

    expect(window.location.search).toContain(
      `${SCHEMA_MANAGER_QUERY_PARAM}=${SCHEMA_MANAGER_QUERY_VALUE}`,
    );
    expect(window.location.search).toContain("id=abc");
  });

  it("removes the param from the URL when the atom transitions to false", () => {
    setSearch(
      `?${SCHEMA_MANAGER_QUERY_PARAM}=${SCHEMA_MANAGER_QUERY_VALUE}&id=abc`,
    );
    stubModal(true);

    const { rerender } = renderHook(() => useSchemaManagerUrl());

    // Mount with atom=true + URL has param: no rewrite (URL is authority on mount).
    expect(window.location.search).toContain(
      `${SCHEMA_MANAGER_QUERY_PARAM}=${SCHEMA_MANAGER_QUERY_VALUE}`,
    );

    // Now flip atom to false (simulate the close button).
    act(() => {
      stubModal(false);
      rerender();
    });

    expect(window.location.search).not.toContain(
      `${SCHEMA_MANAGER_QUERY_PARAM}=${SCHEMA_MANAGER_QUERY_VALUE}`,
    );
    expect(window.location.search).toContain("id=abc");
  });

  it("does not touch the URL on mount even when atom and URL disagree", () => {
    // atom=false but URL has the param: URL→atom will open the modal;
    // atom→URL must NOT clear the URL during the same mount tick (regression
    // test for the open/close infinite loop fix).
    setSearch(`?${SCHEMA_MANAGER_QUERY_PARAM}=${SCHEMA_MANAGER_QUERY_VALUE}`);
    stubModal(false);

    renderHook(() => useSchemaManagerUrl());

    expect(window.location.search).toContain(
      `${SCHEMA_MANAGER_QUERY_PARAM}=${SCHEMA_MANAGER_QUERY_VALUE}`,
    );
  });

  it("re-syncs the atom when a URL_CHANGED_EVENT fires after mount", () => {
    setSearch("");
    stubModal(false);

    renderHook(() => useSchemaManagerUrl());
    openSchemaManager.mockReset();

    // Simulate an external SPA navigation. setSearch's replaceState is patched
    // to dispatch URL_CHANGED_EVENT, so no manual dispatch needed.
    act(() => {
      setSearch(`?${SCHEMA_MANAGER_QUERY_PARAM}=${SCHEMA_MANAGER_QUERY_VALUE}`);
    });

    expect(openSchemaManager).toHaveBeenCalled();
  });

  it("re-syncs the atom on popstate (back/forward)", () => {
    setSearch(`?${SCHEMA_MANAGER_QUERY_PARAM}=${SCHEMA_MANAGER_QUERY_VALUE}`);
    stubModal(true);

    renderHook(() => useSchemaManagerUrl());
    openSchemaManager.mockReset();
    closeSchemaManager.mockReset();

    // Mutate `location` directly so the patched `replaceState` doesn't fire
    // `URL_CHANGED_EVENT` and pre-empt the popstate path we're testing.
    // jsdom allows pushing a new history entry without dispatching popstate,
    // which is the back/forward shape we want to exercise.
    act(() => {
      const newUrl = window.location.pathname;
      // `Object.defineProperty` swap mirrors what jsdom's popstate handler
      // does internally without going through pushState/replaceState.
      const fakeUrl = new URL(newUrl, window.location.origin);
      Object.defineProperty(window, "location", {
        configurable: true,
        value: {
          ...window.location,
          search: fakeUrl.search,
          pathname: fakeUrl.pathname,
          hash: "",
        },
      });
      window.dispatchEvent(new PopStateEvent("popstate"));
    });

    expect(closeSchemaManager).toHaveBeenCalled();
  });
});
