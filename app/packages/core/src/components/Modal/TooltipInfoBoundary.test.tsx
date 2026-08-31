/**
 * @vitest-environment jsdom
 */
import { act, cleanup, render, screen } from "@testing-library/react";
import React from "react";
import { FallbackProps } from "react-error-boundary";
import { RecoilRoot, useSetRecoilState } from "recoil";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Provide just the @fiftyone/state surface the boundary imports.
vi.mock("@fiftyone/state", async () => {
  const { atom } = await vi.importActual<typeof import("recoil")>("recoil");
  return {
    tooltipDetail: atom<{ field: string; label?: { id?: string } } | null>({
      key: "test_tooltipDetail",
      default: null,
    }),
  };
});

// Stub the real tooltip (heavy dependency tree) with one that renders the
// current detail and throws for a designated field, so the tests can drive
// the boundary through error and recovery.
vi.mock("./TooltipInfo", async () => {
  const fos = await import("@fiftyone/state");
  const { useRecoilValue } = await import("recoil");
  return {
    TooltipInfo: () => {
      const detail = useRecoilValue(fos.tooltipDetail);
      if (detail?.field === "explodes") {
        throw new Error("tooltip render failure");
      }
      return <div data-testid="tooltip">{detail?.field ?? "empty"}</div>;
    },
  };
});

import * as fos from "@fiftyone/state";
import {
  TooltipInfoBoundary,
  tooltipDetailIdentity,
} from "./TooltipInfoBoundary";

const Fallback = ({ error }: FallbackProps) => (
  <div data-testid="fallback">{(error as Error).message}</div>
);

type Detail = { field: string; label?: { id?: string } } | null;

let setDetail: (detail: Detail) => void;

const CaptureSetter = () => {
  setDetail = useSetRecoilState(
    fos.tooltipDetail as import("recoil").RecoilState<Detail>,
  );
  return null;
};

const renderBoundary = (onError = vi.fn()) => {
  render(
    <RecoilRoot>
      <CaptureSetter />
      <TooltipInfoBoundary
        FallbackComponent={Fallback}
        onError={onError}
        resetKeys={["sample-1"]}
      />
    </RecoilRoot>,
  );
  return onError;
};

describe("TooltipInfoBoundary", () => {
  // React logs boundary-caught errors to the console and re-dispatches them
  // on window; silence both to keep test output clean
  const swallowWindowError = (e: ErrorEvent) => e.preventDefault();

  beforeEach(() => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    window.addEventListener("error", swallowWindowError);
  });

  afterEach(() => {
    window.removeEventListener("error", swallowWindowError);
    cleanup();
    vi.restoreAllMocks();
  });

  it("renders the tooltip and reports the error when it throws", () => {
    const onError = renderBoundary();
    expect(screen.getByTestId("tooltip").textContent).toBe("empty");

    act(() => setDetail({ field: "explodes", label: { id: "a" } }));

    expect(screen.getByTestId("fallback").textContent).toBe(
      "tooltip render failure",
    );
    expect(onError).toHaveBeenCalledTimes(1);
  });

  it("recovers and renders detail B after detail A throws", () => {
    renderBoundary();

    act(() => setDetail({ field: "explodes", label: { id: "a" } }));
    expect(screen.getByTestId("fallback")).toBeTruthy();

    act(() => setDetail({ field: "confidence", label: { id: "b" } }));

    expect(screen.queryByTestId("fallback")).toBeNull();
    expect(screen.getByTestId("tooltip").textContent).toBe("confidence");
  });
});

describe("tooltipDetailIdentity", () => {
  it("prefers the canonical label id and falls back to field", () => {
    expect(
      tooltipDetailIdentity({ label: { _id: "x", id: "y" }, field: "f" }),
    ).toBe("x");
    expect(tooltipDetailIdentity({ label: { id: "y" }, field: "f" })).toBe("y");
    expect(tooltipDetailIdentity({ field: "f" })).toBe("f");
    expect(tooltipDetailIdentity(null)).toBeUndefined();
  });
});
