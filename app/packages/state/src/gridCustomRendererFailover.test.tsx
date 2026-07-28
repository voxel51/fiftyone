import { act, renderHook } from "@testing-library/react-hooks";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
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

  it("marks only the failed dataset as fail-open and keeps banner dismiss state per dataset", () => {
    const { result } = renderHook(() =>
      useGridCustomRendererFailover("render_claims_grouped_pdf_grid"),
    );

    expect(result.current.isDisabled).toBe(false);
    expect(result.current.isBannerVisible).toBe(false);
    expect(result.current.forcedSubscription).toBeNull();
    expect(isGridCustomRendererFailOpen("render_claims_grouped_pdf_grid")).toBe(
      false,
    );

    act(() => {
      markGridCustomRendererFailed({
        datasetName: "render_claims_grouped_pdf_grid",
        rendererName: "pdf-renderer",
        errorMessage: "render failed",
      });
    });

    expect(
      getGridCustomRendererFailover("render_claims_grouped_pdf_grid"),
    ).toMatchObject({
      datasetName: "render_claims_grouped_pdf_grid",
      errorMessage: "render failed",
      rendererName: "pdf-renderer",
    });
    expect(result.current.isDisabled).toBe(true);
    expect(result.current.isBannerVisible).toBe(true);
    expect(result.current.forcedSubscription).toMatch(/^failopen-\d+$/);
    expect(isGridCustomRendererFailOpen("render_claims_grouped_pdf_grid")).toBe(
      true,
    );
    expect(isGridCustomRendererFailOpen("quickstart")).toBe(false);

    act(() => {
      dismissGridCustomRendererFailoverBanner("render_claims_grouped_pdf_grid");
    });

    expect(result.current.isDisabled).toBe(true);
    expect(result.current.isBannerVisible).toBe(false);
    expect(result.current.forcedSubscription).toMatch(/^failopen-\d+$/);
  });

  it("rotates the forced subscription when a second dataset fails for the first time", () => {
    const { result: grouped } = renderHook(() =>
      useGridCustomRendererFailover("render_claims_grouped_pdf_grid"),
    );
    const { result: csv } = renderHook(() =>
      useGridCustomRendererFailover("render_claims_csv_media_type"),
    );

    const nowSpy = vi.spyOn(Date, "now").mockReturnValueOnce(101);

    try {
      act(() => {
        markGridCustomRendererFailed({
          datasetName: "render_claims_grouped_pdf_grid",
          rendererName: "pdf-renderer",
        });
      });

      const firstForcedSubscription = grouped.current.forcedSubscription;

      expect(firstForcedSubscription).toMatch(/^failopen-\d+$/);
      expect(grouped.current.isDisabled).toBe(true);
      expect(csv.current.isDisabled).toBe(false);

      act(() => {
        markGridCustomRendererFailed({
          datasetName: "render_claims_csv_media_type",
          rendererName: "csv-renderer",
        });
      });

      expect(csv.current.isDisabled).toBe(true);
      expect(grouped.current.forcedSubscription).toMatch(/^failopen-\d+$/);
      expect(grouped.current.forcedSubscription).not.toBe(
        firstForcedSubscription,
      );
    } finally {
      nowSpy.mockRestore();
    }
  });
});
