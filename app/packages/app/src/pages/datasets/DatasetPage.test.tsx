import type React from "react";
import { describe, expect, it, vi } from "vitest";

const { mcapImportSpy } = vi.hoisted(() => ({
  mcapImportSpy: vi.fn(),
}));

vi.mock("@fiftyone/core", () => ({
  ActivityToast: () => null,
  Dataset: () => null,
  QueryPerformanceToast: () => null,
  Snackbar: () => null,
  Starter: () => null,
}));

vi.mock("@fiftyone/embeddings", () => ({}));
vi.mock("@fiftyone/map", () => ({}));
vi.mock(
  "@fiftyone/mcap",
  () => {
    mcapImportSpy();
    return {};
  },
  { virtual: true }
);
vi.mock("@fiftyone/operators", () => ({
  OperatorCore: () => null,
}));
vi.mock("@fiftyone/relay", () => ({}));
vi.mock("@fiftyone/state", () => ({
  datasetQueryContext: {
    Provider: ({ children }: React.PropsWithChildren) => children,
  },
  datasetSampleCount: {},
}));
vi.mock("react-relay", () => ({
  usePreloadedQuery: () => ({}),
}));
vi.mock("recoil", () => ({
  useRecoilValue: () => 0,
}));
vi.mock("relay-runtime", () => ({
  graphql: (value: TemplateStringsArray) => value[0],
}));
vi.mock("../../components/Nav", () => ({
  default: ({ children }: React.PropsWithChildren) => children,
}));
vi.mock("../index.module.css", () => ({
  default: { page: "page" },
}));
vi.mock("./DatasetGridRendererFailover", () => ({
  DatasetGridRendererFailover: () => null,
}));

describe("DatasetPage", () => {
  it("loads the MCAP package on dataset pages", async () => {
    await import("./DatasetPage");

    expect(mcapImportSpy).toHaveBeenCalledTimes(1);
  });
});
