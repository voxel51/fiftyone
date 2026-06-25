import { render, screen } from "@testing-library/react";
import { useEffect, type ComponentType } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { McapGridStreamSelector } from "./McapGridStreamSelector";
import {
  __resetMcapGridStreamStateForTests,
  useRegisterMcapGridStreamTopics,
} from "./mcap-grid-stream-state";

const { storedValues, useCurrentDataset } = vi.hoisted(() => ({
  storedValues: new Map<string, string>(),
  useCurrentDataset: vi.fn(),
}));

vi.mock("@fiftyone/state", async () => {
  const React = await vi.importActual<typeof import("react")>("react");

  return {
    useBrowserStorage: <T,>(key: string, initialValue: T) => {
      const [value, setValue] = React.useState<T>(() => {
        const stored = storedValues.get(key);
        return stored ? JSON.parse(stored) : initialValue;
      });

      return [
        value,
        (nextValue: T | ((value: T) => T)) => {
          setValue((previousValue) => {
            const resolvedValue =
              nextValue instanceof Function
                ? nextValue(previousValue)
                : nextValue;
            storedValues.set(key, JSON.stringify(resolvedValue));
            return resolvedValue;
          });
        },
      ] as const;
    },
    useCurrentDataset: (...args: unknown[]) => useCurrentDataset(...args),
  };
});

vi.mock("@fiftyone/components", async () => {
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

describe("McapGridStreamSelector", () => {
  beforeEach(() => {
    storedValues.clear();
    __resetMcapGridStreamStateForTests();
    useCurrentDataset.mockReturnValue({
      mediaType: "multimodal",
      name: "dataset",
    });
  });

  afterEach(() => {
    storedValues.clear();
    __resetMcapGridStreamStateForTests();
  });

  it("shows auto and mounted MCAP stream topics", async () => {
    render(<RegisteredSelector />);

    expect(screen.getByTestId("selected-stream").textContent).toBe("");
    expect(screen.getByText("Stream: Auto")).toBeTruthy();
    expect(screen.getByText("/camera/back")).toBeTruthy();
    expect(screen.getByText("/camera/front")).toBeTruthy();
    expect(screen.getByText("/lidar/points")).toBeTruthy();
  });
});

function RegisteredSelector() {
  const register = useRegisterMcapGridStreamTopics();

  useEffect(
    () =>
      register({
        datasetName: "dataset",
        sampleId: "sample",
        topics: ["/camera/front", "/camera/back", "/lidar/points"],
      }),
    [register],
  );

  return <McapGridStreamSelector />;
}
