import { render, screen } from "@testing-library/react";
import { useEffect, type ComponentType } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GridStreamSelector } from "./GridStreamSelector";
import {
  __resetGridStreamStateForTests,
  useRegisterGridStreams,
} from "./grid-stream-state";

const { storedValues, useCurrentDataset } = vi.hoisted(() => ({
  storedValues: new Map<string, unknown>(),
  useCurrentDataset:
    vi.fn<() => { readonly mediaType: string; readonly name: string }>(),
}));

vi.mock("@fiftyone/state", async () => {
  const React = await vi.importActual<typeof import("react")>("react");

  return {
    useBrowserStorage: <T,>(key: string, initialValue: T) => {
      const [value, setValue] = React.useState<T>(() => {
        const stored = storedValues.get(key);
        // Mirrors useBrowserStorage's generic trust boundary for values this
        // harness itself stored under the same key.
        return stored === undefined ? initialValue : (stored as T);
      });

      return [
        value,
        (nextValue: T | ((value: T) => T)) => {
          setValue((previousValue) => {
            const resolvedValue =
              nextValue instanceof Function
                ? nextValue(previousValue)
                : nextValue;
            storedValues.set(key, resolvedValue);
            return resolvedValue;
          });
        },
      ] as const;
    },
    useCurrentDataset,
  };
});

vi.mock("@fiftyone/components", () => {
  class SelectorValidationError extends Error {}

  return {
    Selector: ({
      component: Component,
      useSearch,
      value,
    }: {
      readonly component: ComponentType<{ value: string }>;
      readonly useSearch: (search: string) => { values?: string[] };
      readonly value: string;
    }) => (
      <div>
        <div data-testid="selected-stream">{value}</div>
        {useSearch("").values?.map((option) => (
          <div key={option}>
            <Component value={option} />
          </div>
        ))}
      </div>
    ),
    SelectorValidationError,
  };
});

describe("GridStreamSelector", () => {
  beforeEach(() => {
    storedValues.clear();
    __resetGridStreamStateForTests();
    useCurrentDataset.mockReturnValue({
      mediaType: "multimodal",
      name: "dataset",
    });
  });

  afterEach(() => {
    storedValues.clear();
    __resetGridStreamStateForTests();
  });

  it("shows auto and mounted episode streams", () => {
    render(<RegisteredSelector />);

    expect(screen.getByTestId("selected-stream").textContent).toBe("");
    expect(screen.getByText("Stream: Auto")).toBeTruthy();
    expect(screen.getByText("/camera/back")).toBeTruthy();
    expect(screen.getByText("/camera/front")).toBeTruthy();
    expect(screen.getByText("/lidar/points")).toBeTruthy();
  });
});

function RegisteredSelector() {
  const register = useRegisterGridStreams();

  // This effect registers the fixture streams for the selector under test.
  useEffect(
    () =>
      register({
        datasetName: "dataset",
        sampleId: "sample",
        streams: ["/camera/front", "/camera/back", "/lidar/points"],
      }),
    [register],
  );

  return <GridStreamSelector />;
}
