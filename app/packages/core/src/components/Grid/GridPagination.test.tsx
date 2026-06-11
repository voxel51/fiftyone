/**
 * @vitest-environment jsdom
 */
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import Grid from "./Grid";

const mockState = vi.hoisted(() => ({
  values: {
    gridSpacing: 3,
    gridAutosizing: false,
    maxGridItemsSizeBytes: 1000,
    gridCrop: false,
    gridPage: 0,
    config: { gridPagination: true, gridPageSize: 20 },
    datasetSampleCount: 45,
    gridPaginationOption: true,
  },
  setCurrentPage: vi.fn(),
  setGridPagination: vi.fn(),
}));

const pageMock = vi.fn(() =>
  Promise.resolve({ items: [], next: null, previous: null })
);
const useSpotlightPagerMock = vi.fn(() => ({
  page: pageMock,
  store: new WeakMap(),
}));

vi.mock("@fiftyone/components", () => ({
  Button: ({ children, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement>) => (
    <button type="button" {...props}>
      {children}
    </button>
  ),
}));

vi.mock("@voxel51/voodo", () => ({
  Size: { Md: "md" },
  Toggle: ({ label, checked, onChange }: { label: string; checked: boolean; onChange: (next: boolean) => void }) => (
    <button type="button" onClick={() => onChange(!checked)}>
      {label}
    </button>
  ),
}));

vi.mock("@fiftyone/spotlight", () => ({
  default: class Spotlight {
    options: Record<string, unknown>;

    constructor(options: Record<string, unknown>) {
      this.options = options;
    }
  },
}));

vi.mock("@fiftyone/state", () => ({
  config: { key: "config" },
  datasetSampleCount: { key: "datasetSampleCount" },
  appConfigOption: ({ modal, key }: { modal: boolean; key: string }) => ({
    key: `appConfigOptions-${modal}-${key}`,
  }),
  useExpandSample: () => vi.fn(),
}));

vi.mock("recoil", () => ({
  useRecoilState: (node: { key: string }) => {
    if (node.key === "gridPage") {
      return [mockState.values.gridPage, mockState.setCurrentPage];
    }

    if (node.key.startsWith("appConfigOptions")) {
      return [
        mockState.values.gridPaginationOption,
        mockState.setGridPagination,
      ];
    }

    throw new Error(`Unexpected recoil state: ${node.key}`);
  },
  useRecoilValue: (node: { key: string }) => {
    if (!(node.key in mockState.values)) {
      throw new Error(`Unexpected recoil value: ${node.key}`);
    }

    return mockState.values[node.key as keyof typeof mockState.values];
  },
}));

vi.mock("./recoil", () => ({
  gridAutosizing: { key: "gridAutosizing" },
  gridCrop: { key: "gridCrop" },
  gridPage: { key: "gridPage" },
  gridSpacing: { key: "gridSpacing" },
  maxGridItemsSizeBytes: { key: "maxGridItemsSizeBytes" },
  pageParameters: { key: "pageParameters" },
}));

vi.mock("../../hooks", () => ({
  useSyncLabelsRenderingStatus: () => undefined,
}));

vi.mock("./useEscape", () => ({
  default: () => undefined,
}));

vi.mock("./useEvents", () => ({
  default: () => undefined,
}));

vi.mock("./useLabelVisibility", () => ({
  default: () => ({}),
}));

vi.mock("./useLookerCache", () => ({
  default: () => ({ freeze: vi.fn() }),
}));

vi.mock("./useRecords", () => ({
  default: () => new Map(),
}));

vi.mock("./useRefreshers", () => ({
  default: () => ({ pageReset: "reset", reset: "reset" }),
}));

vi.mock("./useRenderer", () => ({
  default: () => ({
    getFontSize: vi.fn(),
    lookerOptions: {},
    renderer: {},
  }),
}));

vi.mock("./useResize", () => ({
  default: () => undefined,
}));

vi.mock("./useScrollLocation", () => ({
  default: () => ({
    get: () => ({}),
    set: vi.fn(),
  }),
}));

vi.mock("./useSpotlightPager", () => ({
  default: (...args: unknown[]) => useSpotlightPagerMock(...args),
}));

vi.mock("./useUpdates", () => ({
  default: () => undefined,
}));

vi.mock("./useZoomSetting", () => ({
  default: () => 1,
}));

describe("Grid pagination", () => {
  beforeEach(() => {
    mockState.values = {
      gridSpacing: 3,
      gridAutosizing: false,
      maxGridItemsSizeBytes: 1000,
      gridCrop: false,
      gridPage: 0,
      config: { gridPagination: true, gridPageSize: 20 },
      datasetSampleCount: 45,
      gridPaginationOption: true,
    };
    mockState.setCurrentPage.mockReset();
    mockState.setGridPagination.mockReset();
    pageMock.mockClear();
    useSpotlightPagerMock.mockClear();
    window.history.pushState({}, "", "/");
  });

  afterEach(() => {
    cleanup();
  });

  it("renders the pagination bar when enabled", () => {
    render(<Grid />);

    expect(screen.getByText("Pagination")).toBeTruthy();
    expect(screen.getByText("Prev")).toBeTruthy();
    expect(screen.getByText("Next")).toBeTruthy();
    expect(screen.getByText(/Showing 1.*20 of 45/)).toBeTruthy();

    const prevButton = screen.getByText("Prev").closest("button");
    expect(prevButton?.hasAttribute("disabled")).toBe(true);
  });

  it("passes pagination settings to spotlight pager", () => {
    render(<Grid />);

    expect(useSpotlightPagerMock).toHaveBeenCalledTimes(1);
    expect(useSpotlightPagerMock.mock.calls[0][0]).toMatchObject({
      pagination: true,
      pageSize: 20,
    });
  });

  it("calls pager and updates state when clicking Next", async () => {
    render(<Grid />);

    fireEvent.click(screen.getByText("Next"));

    expect(mockState.setCurrentPage).toHaveBeenCalledWith(1);
    expect(pageMock).toHaveBeenCalledWith(1);
  });

  it("calls pager and updates state when clicking Prev", async () => {
    mockState.values.gridPage = 1;

    render(<Grid />);

    fireEvent.click(screen.getByText("Prev"));

    expect(mockState.setCurrentPage).toHaveBeenCalledWith(0);
    expect(pageMock).toHaveBeenCalledWith(0);
  });

  it("disables Next on the last page", () => {
    mockState.values.gridPage = 2;

    render(<Grid />);

    const nextButton = screen.getByText("Next").closest("button");
    expect(nextButton?.hasAttribute("disabled")).toBe(true);
  });

  it("renders zero state when there are no samples", () => {
    mockState.values.datasetSampleCount = 0;

    render(<Grid />);

    expect(screen.getByText("Showing 0 of 0")).toBeTruthy();

    const prevButton = screen.getByText("Prev").closest("button");
    const nextButton = screen.getByText("Next").closest("button");
    expect(prevButton?.hasAttribute("disabled")).toBe(true);
    expect(nextButton?.hasAttribute("disabled")).toBe(true);
  });

  it("syncs the initial page from the URL", () => {
    window.history.pushState({}, "", "/?page=3");

    render(<Grid />);

    expect(mockState.setCurrentPage).toHaveBeenCalledWith(2);
  });

  it("updates the URL when the current page changes", () => {
    mockState.values.gridPage = 1;
    const pushStateSpy = vi.spyOn(window.history, "pushState");

    render(<Grid />);

    expect(pushStateSpy).toHaveBeenCalledWith(
      expect.anything(),
      "",
      "/?page=2"
    );
    pushStateSpy.mockRestore();
  });

  it("removes the page param when on page 1", () => {
    window.history.pushState({}, "", "/?page=1");
    const pushStateSpy = vi.spyOn(window.history, "pushState");

    render(<Grid />);

    expect(pushStateSpy).toHaveBeenCalledWith(expect.anything(), "", "/");
    pushStateSpy.mockRestore();
  });

  it("does not push state when the URL already matches", () => {
    mockState.values.gridPage = 1;
    window.history.pushState({}, "", "/?page=2");
    const pushStateSpy = vi.spyOn(window.history, "pushState");

    render(<Grid />);

    expect(pushStateSpy).not.toHaveBeenCalled();
    pushStateSpy.mockRestore();
  });

  it("defaults to page 1 when the URL has an invalid page", () => {
    window.history.pushState({}, "", "/?page=abc");

    render(<Grid />);

    expect(mockState.setCurrentPage).toHaveBeenCalledWith(0);
  });

  it("ignores URL sync when pagination is disabled", () => {
    mockState.values.gridPaginationOption = false;
    mockState.values.config = { gridPagination: false, gridPageSize: 20 };
    window.history.pushState({}, "", "/?page=3");
    const pushStateSpy = vi.spyOn(window.history, "pushState");
    const addEventListenerSpy = vi.spyOn(window, "addEventListener");

    render(<Grid />);

    expect(pushStateSpy).not.toHaveBeenCalled();
    expect(addEventListenerSpy).not.toHaveBeenCalledWith(
      "popstate",
      expect.any(Function)
    );

    pushStateSpy.mockRestore();
    addEventListenerSpy.mockRestore();
  });

  it("hides the pagination bar when disabled", () => {
    mockState.values.gridPaginationOption = false;
    mockState.values.config = { gridPagination: false, gridPageSize: 30 };

    render(<Grid />);

    expect(screen.getByText("Pagination")).toBeTruthy();
    expect(screen.queryByText("Prev")).toBeNull();
    expect(useSpotlightPagerMock.mock.calls[0][0]).toMatchObject({
      pagination: false,
      pageSize: undefined,
    });
  });

  it("toggles pagination from the grid", () => {
    render(<Grid />);

    fireEvent.click(screen.getByText("Pagination"));

    expect(mockState.setGridPagination).toHaveBeenCalledWith(false);
    expect(mockState.setCurrentPage).toHaveBeenCalledWith(0);
    expect(window.location.search).toBe("");
  });
});
