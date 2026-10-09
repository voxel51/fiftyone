/**
 * Copyright 2017-2026, Voxel51, Inc.
 */

import { createLocationStore, LocationProvider } from "@fiftyone/location";
import { memoryHarness } from "@fiftyone/location/src/testing";
import { act, render } from "@testing-library/react";
import React, { useEffect } from "react";
import { describe, expect, it, vi } from "vitest";

const navMounts = vi.fn();
const byCy = (cy: string) => document.querySelector(`[data-cy="${cy}"]`);

vi.mock("@fiftyone/core", () => {
  const Stub = () => null;
  return {
    ActivityToast: Stub,
    Dataset: () => <div data-cy="grid" />,
    DatasetGridRendererFailover: Stub,
    Modal: () => <div data-cy="modal" />,
    ModalActionItems: Stub,
    ModalModeSwitch: Stub,
    QueryPerformanceToast: Stub,
    SchemaManagerOutlet: Stub,
    Snackbar: Stub,
  };
});
vi.mock("@fiftyone/embeddings-v2", () => ({}));
vi.mock("@fiftyone/map", () => ({}));
vi.mock("@fiftyone/relay", () => ({}));
vi.mock("@fiftyone/operators", () => ({ OperatorCore: () => null }));
vi.mock("@fiftyone/state", () => ({
  datasetQueryContext: React.createContext(null),
  datasetSampleCount: "count",
  isModalActive: "modal",
}));
vi.mock("@fiftyone/reverb", () => ({
  useReverbValue: (atom: string) => (atom === "count" ? 1 : true),
}));
vi.mock("react-relay", () => ({ usePreloadedQuery: () => ({}) }));
const Nav = ({
  children,
  hidden,
}: React.PropsWithChildren<{ hidden?: boolean }>) => {
  useEffect(() => navMounts(), []);
  return (
    <>
      <header data-cy="nav" data-hidden={String(!!hidden)} />
      {children}
    </>
  );
};
vi.mock("../../components/Nav", () => ({ default: Nav }));
vi.mock("../../components/Starter", () => ({ AddSample: () => null }));
vi.mock("../../product", () => ({ useProduct: () => ({}) }));
vi.mock("../../samplePage/SamplePageHeader", () => ({ default: () => null }));

const { appRoutes } = await import("../../location/routes");
const { default: DatasetPage } = await import("./DatasetPage");

describe("DatasetPage", () => {
  it("keeps the nav mounted while a sample opens and closes", () => {
    const harness = memoryHarness("/datasets/d");
    const store = createLocationStore(harness.adapter, appRoutes);
    render(
      <LocationProvider store={store}>
        <DatasetPage prepared={{} as never} />
      </LocationProvider>,
    );

    const nav = byCy("nav") as HTMLElement;
    expect(nav.dataset.hidden).toBe("false");
    expect(byCy("dataset-page")).toBeTruthy();

    act(() => harness.adapter.push("/datasets/d/sample/a"));
    expect(byCy("sample-page")).toBeTruthy();
    expect(byCy("nav")).toBe(nav);
    expect(nav.dataset.hidden).toBe("true");

    act(() => harness.back());
    expect(byCy("dataset-page")).toBeTruthy();
    expect(byCy("nav")).toBe(nav);
    expect(nav.dataset.hidden).toBe("false");
    expect(navMounts).toHaveBeenCalledTimes(1);
  });
});
