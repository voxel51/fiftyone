import { act, renderHook } from "@testing-library/react-hooks";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  __resetGridCustomRendererFailoverForTests,
  dismissGridCustomRendererFailoverBanner,
  getGridCustomRendererFailover,
  isGridCustomRendererFailOpen,
  markGridCustomRendererFailed,
  useGridCustomRendererFailover,
} from "./gridCustomRendererFailover";

describe("gridCustomRendererFailover", () => {
  beforeEach(() => {
    __resetGridCustomRendererFailoverForTests();
  });

  afterEach(() => {
    __resetGridCustomRendererFailoverForTests();
  });

  it("marks the session as fail-open and keeps the banner dismiss state separate", () => {
    const { result } = renderHook(() => useGridCustomRendererFailover());

    expect(result.current.isDisabled).toBe(false);
    expect(result.current.isBannerVisible).toBe(false);
    expect(result.current.forcedSubscription).toBeNull();
    expect(isGridCustomRendererFailOpen()).toBe(false);

    act(() => {
      markGridCustomRendererFailed({
        datasetName: "render_claims_grouped_pdf_grid",
        rendererName: "pdf-renderer",
        errorMessage: "render failed",
      });
    });

    expect(getGridCustomRendererFailover()).toMatchObject({
      datasetName: "render_claims_grouped_pdf_grid",
      errorMessage: "render failed",
      rendererName: "pdf-renderer",
    });
    expect(result.current.isDisabled).toBe(true);
    expect(result.current.isBannerVisible).toBe(true);
    expect(result.current.forcedSubscription).toMatch(/^failopen-\d+$/);
    expect(isGridCustomRendererFailOpen()).toBe(true);

    act(() => {
      dismissGridCustomRendererFailoverBanner();
    });

    expect(result.current.isDisabled).toBe(true);
    expect(result.current.isBannerVisible).toBe(false);
    expect(result.current.forcedSubscription).toMatch(/^failopen-\d+$/);
  });
});
