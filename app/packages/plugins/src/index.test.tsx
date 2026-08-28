import { cleanup, render, screen } from "@testing-library/react";
import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  operatorState: {
    hasError: false,
    isLoading: true,
    ready: false,
  },
  pluginState: "ready" as "error" | "loading" | "ready",
}));

vi.mock("recoil", () => ({
  atom: vi.fn((value) => value),
  useRecoilState: vi.fn(() => [mocks.pluginState, vi.fn()]),
  useRecoilValue: vi.fn(() => "dataset"),
}));

vi.mock("@fiftyone/operators", () => ({
  useOperators: vi.fn(() => mocks.operatorState),
}));

vi.mock("@fiftyone/state", () => ({
  datasetName: "datasetName",
  useNotification: vi.fn(() => vi.fn()),
}));

vi.mock("@fiftyone/utilities", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@fiftyone/utilities")>()),
  getFetchFunction: vi.fn(() => vi.fn(() => new Promise(() => undefined))),
  getFetchParameters: vi.fn(() => ({ pathPrefix: "" })),
  getFetchPathPrefix: vi.fn(() => ""),
}));

vi.mock("./registry", () => ({
  usingRegistry: vi.fn(() => ({
    getScript: vi.fn(),
    registerPluginDefinition: vi.fn(),
    registerScript: vi.fn(),
  })),
}));

vi.mock("./externalize", () => ({}));

import { usePlugins } from ".";

function GridBoundary() {
  const plugins = usePlugins();
  if (plugins.isLoadingPlugins) return <div>Pixelating</div>;
  return (
    <div>
      <span>Grid</span>
      <span>
        {plugins.isLoading ? "operators-loading" : "operators-loaded"}
      </span>
      <span>{plugins.ready ? "ready" : "not-ready"}</span>
      <span>{plugins.hasError ? "operator-error" : "no-error"}</span>
    </div>
  );
}

describe("usePlugins readiness boundaries", () => {
  afterEach(cleanup);

  beforeEach(() => {
    mocks.pluginState = "ready";
    mocks.operatorState = {
      hasError: false,
      isLoading: true,
      ready: false,
    };
  });

  it("mounts grid children while operator definitions are pending", () => {
    const { rerender } = render(<GridBoundary />);

    expect(screen.getByText("Grid")).toBeTruthy();
    expect(screen.getByText("operators-loading")).toBeTruthy();

    mocks.operatorState = {
      hasError: false,
      isLoading: false,
      ready: true,
    };
    rerender(<GridBoundary />);

    expect(screen.getByText("operators-loaded")).toBeTruthy();
    expect(screen.getByText("ready")).toBeTruthy();
  });

  it("keeps placement readiness and operator errors local to consumers", () => {
    mocks.operatorState = {
      hasError: false,
      isLoading: false,
      ready: false,
    };
    const { rerender } = render(<GridBoundary />);

    expect(screen.getByText("Grid")).toBeTruthy();
    expect(screen.getByText("operators-loaded")).toBeTruthy();
    expect(screen.getByText("not-ready")).toBeTruthy();

    mocks.operatorState = {
      hasError: true,
      isLoading: false,
      ready: false,
    };
    rerender(<GridBoundary />);

    expect(screen.getByText("Grid")).toBeTruthy();
    expect(screen.getByText("operator-error")).toBeTruthy();
  });

  it("continues to gate children on plugin metadata and bundles", () => {
    mocks.pluginState = "loading";
    mocks.operatorState = {
      hasError: false,
      isLoading: false,
      ready: true,
    };

    render(<GridBoundary />);

    expect(screen.getByText("Pixelating")).toBeTruthy();
    expect(screen.queryByText("Grid")).toBeNull();
  });
});
