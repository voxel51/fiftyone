/**
 * Copyright 2017-2026, Voxel51, Inc.
 */

/**
 * @vitest-environment jsdom
 */
import React from "react";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import FileTable from "./FileTable";

// @fiftyone/components imports @fiftyone/utilities transitively via @fiftyone/looker,
// and utilities has Node.js dependencies that don't work in jsdom.
// These mocks break that dependency chain.
vi.mock("@fiftyone/components", () => ({
  Button: ({ children, onClick }: any) => (
    <button onClick={onClick}>{children}</button>
  ),
  scrollable: "mock-scrollable",
}));

vi.mock("@fiftyone/utilities", () => ({
  humanReadableBytes: (bytes: number) => (bytes ? `${bytes} B` : ""),
}));

const defaultProps = {
  chooseMode: "file" as const,
  files: [],
  selectedFile: null,
  onSelectFile: vi.fn(),
  onChoose: vi.fn(),
  onOpenDir: vi.fn(),
  nextPage: vi.fn(),
  hasNextPage: false,
};

describe("FileTable", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    cleanup();
  });

  it("should render table headers", () => {
    render(<FileTable {...defaultProps} />);

    expect(screen.getByText("Name")).toBeTruthy();
    expect(screen.getByText("Modified")).toBeTruthy();
    expect(screen.getByText("Size")).toBeTruthy();
  });

  it("should render files", () => {
    const files = [
      { name: "test.txt", type: "file", absolute_path: "/test.txt" },
    ];

    render(<FileTable {...defaultProps} files={files} />);

    expect(screen.getAllByText("test.txt").length).toBeGreaterThan(0);
  });

  it("should call onSelectFile when row is clicked", () => {
    const onSelectFile = vi.fn();
    const files = [
      { name: "test.txt", type: "file", absolute_path: "/test.txt" },
    ];

    render(
      <FileTable {...defaultProps} files={files} onSelectFile={onSelectFile} />
    );

    fireEvent.click(screen.getAllByText("test.txt")[0]);

    expect(onSelectFile).toHaveBeenCalledWith(files[0]);
  });

  it("should call onOpenDir when directory is double-clicked", () => {
    const onOpenDir = vi.fn();
    const files = [
      { name: "mydir", type: "directory", absolute_path: "/mydir" },
    ];

    render(<FileTable {...defaultProps} files={files} onOpenDir={onOpenDir} />);

    fireEvent.doubleClick(screen.getAllByText("mydir")[0]);

    expect(onOpenDir).toHaveBeenCalledWith(files[0]);
  });

  it("should show Load more button when hasNextPage is true", () => {
    render(<FileTable {...defaultProps} hasNextPage={true} />);

    expect(screen.getByText("Load more")).toBeTruthy();
  });

  it("should not show Load more button when hasNextPage is false", () => {
    render(<FileTable {...defaultProps} hasNextPage={false} />);

    expect(screen.queryByText("Load more")).toBeNull();
  });

  it("should call nextPage when Load more is clicked", () => {
    const nextPage = vi.fn();

    render(
      <FileTable {...defaultProps} hasNextPage={true} nextPage={nextPage} />
    );

    fireEvent.click(screen.getByText("Load more"));

    expect(nextPage).toHaveBeenCalled();
  });
});
