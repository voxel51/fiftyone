/**
 * Copyright 2017-2026, Voxel51, Inc.
 */

/**
 * @vitest-environment jsdom
 */
import React from "react";
import { render, screen, cleanup, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// Mock dependencies before importing component
// These mocks break the dependency chain that pulls in Node.js-specific modules

vi.mock("@fiftyone/operators", () => ({
  executeOperator: vi.fn(),
}));

// Mock utils to avoid pulling in @fiftyone/utilities
vi.mock("../utils", () => ({
  getComponentProps: (_props: unknown, _id: string, baseProps = {}) =>
    baseProps,
}));

// DynamicIO has complex dependencies, mock it for isolation
vi.mock("./DynamicIO", () => ({
  default: ({ schema }: { schema: { view?: { label?: string } } }) => (
    <div data-testid="dynamic-io">{schema?.view?.label || "placeholder"}</div>
  ),
}));

import { executeOperator } from "@fiftyone/operators";
import LoaderView from "./LoaderView";

const mockExecuteOperator = vi.mocked(executeOperator);

const createProps = (overrides = {}) => ({
  path: "myLoader",
  schema: {
    type: { name: "Object" },
    view: {
      name: "LoaderView",
      operator: "@test/load_data",
      params: { key: "value" },
      label: "Loading data...",
    },
  },
  onChange: vi.fn(),
  fullData: {},
  ...overrides,
});

describe("LoaderView", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    cleanup();
  });

  describe("loading state", () => {
    it("renders loading indicator with label", () => {
      render(<LoaderView {...createProps()} />);

      expect(screen.getByText("Loading data...")).toBeTruthy();
    });

    it("renders default label when none provided", () => {
      const props = createProps({
        schema: {
          view: {
            operator: "@test/load",
            params: {},
          },
        },
      });

      render(<LoaderView {...props} />);

      expect(screen.getByText("Loading...")).toBeTruthy();
    });

    it("renders CircularProgress while loading", () => {
      render(<LoaderView {...createProps()} />);

      // MUI CircularProgress renders with role="progressbar"
      expect(screen.getByRole("progressbar")).toBeTruthy();
    });
  });

  describe("operator execution", () => {
    it("calls executeOperator on mount", async () => {
      render(<LoaderView {...createProps()} />);

      await waitFor(() => {
        expect(mockExecuteOperator).toHaveBeenCalledWith(
          "@test/load_data",
          { key: "value" },
          expect.objectContaining({ callback: expect.any(Function) })
        );
      });
    });

    it("sets loading state before executing", () => {
      const onChange = vi.fn();
      render(<LoaderView {...createProps({ onChange })} />);

      expect(onChange).toHaveBeenCalledWith("myLoader", { state: "loading" });
    });

    it("sets loaded state on success", async () => {
      const onChange = vi.fn();
      mockExecuteOperator.mockImplementation((_uri, _params, options) => {
        (options as { callback: (result: unknown) => void }).callback({
          result: [{ id: 1 }],
          error: null,
        });
        return Promise.resolve();
      });

      render(<LoaderView {...createProps({ onChange })} />);

      await waitFor(() => {
        expect(onChange).toHaveBeenCalledWith("myLoader", {
          state: "loaded",
          data: [{ id: 1 }],
        });
      });
    });

    it("sets errored state on failure", async () => {
      const onChange = vi.fn();
      mockExecuteOperator.mockImplementation((_uri, _params, options) => {
        (options as { callback: (result: unknown) => void }).callback({
          result: null,
          error: "Failed",
          errorMessage: "Network error",
        });
        return Promise.resolve();
      });

      render(<LoaderView {...createProps({ onChange })} />);

      await waitFor(() => {
        expect(onChange).toHaveBeenCalledWith("myLoader", {
          state: "errored",
          error: "Network error",
        });
      });
    });

    it("uses error string when errorMessage is not available", async () => {
      const onChange = vi.fn();
      mockExecuteOperator.mockImplementation((_uri, _params, options) => {
        (options as { callback: (result: unknown) => void }).callback({
          result: null,
          error: "Raw error",
        });
        return Promise.resolve();
      });

      render(<LoaderView {...createProps({ onChange })} />);

      await waitFor(() => {
        expect(onChange).toHaveBeenCalledWith("myLoader", {
          state: "errored",
          error: "Raw error",
        });
      });
    });
  });

  describe("re-loading on param change", () => {
    it("re-executes operator when params change", async () => {
      const props = createProps();
      const { rerender } = render(<LoaderView {...props} />);

      await waitFor(() => {
        expect(mockExecuteOperator).toHaveBeenCalledTimes(1);
      });

      const newProps = createProps({
        schema: {
          view: {
            operator: "@test/load_data",
            params: { key: "new_value" },
          },
        },
      });

      rerender(<LoaderView {...newProps} />);

      await waitFor(() => {
        expect(mockExecuteOperator).toHaveBeenCalledTimes(2);
      });
    });

    it("does not re-execute when already loading", async () => {
      const props = createProps({
        fullData: { myLoader: { state: "loading" } },
      });

      render(<LoaderView {...props} />);

      // Should not call executeOperator when state is already loading
      expect(mockExecuteOperator).not.toHaveBeenCalled();
    });
  });

  describe("rendered states", () => {
    it("renders nothing when state is loaded", () => {
      const props = createProps({
        fullData: { myLoader: { state: "loaded", data: [] } },
      });

      const { container } = render(<LoaderView {...props} />);

      expect(container.firstChild).toBeNull();
    });

    it("renders error message when errored", () => {
      const props = createProps({
        fullData: {
          myLoader: { state: "errored", error: "Something went wrong" },
        },
      });

      render(<LoaderView {...props} />);

      expect(screen.getByText("Something went wrong")).toBeTruthy();
    });

    it("renders default error message when error is empty", () => {
      const props = createProps({
        fullData: { myLoader: { state: "errored" } },
      });

      render(<LoaderView {...props} />);

      expect(screen.getByText("Failed to load data")).toBeTruthy();
    });
  });

  describe("no operator", () => {
    it("does not call executeOperator when operator is not provided", () => {
      const props = createProps({
        schema: {
          view: {
            params: { key: "value" },
          },
        },
      });

      render(<LoaderView {...props} />);

      expect(mockExecuteOperator).not.toHaveBeenCalled();
    });
  });
});
