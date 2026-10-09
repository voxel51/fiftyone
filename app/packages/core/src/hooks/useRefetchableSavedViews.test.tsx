import { act, cleanup, render, screen } from "@testing-library/react";
import React, { Suspense } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import useRefetchableSavedViews from "./useRefetchableSavedViews";

type Resource = {
  status: "pending" | "done";
  names: string[];
  promise: Promise<void>;
};

const relay = vi.hoisted(() => ({
  resolve: (_names: string[]): void => undefined,
}));

vi.mock("@fiftyone/relay", () => ({ savedViewsFragment: {} }));

vi.mock("@fiftyone/state", async () => {
  const { createContext } = await import("react");
  return { datasetQueryContext: createContext({}) };
});

// Relay's refetch suspends the component reading the fragment until the
// response arrives
vi.mock("react-relay", async () => {
  const { useState } = await import("react");
  return {
    useRefetchableFragment: () => {
      const [resource, setResource] = useState<Resource>({
        status: "done",
        names: ["before"],
        promise: Promise.resolve(),
      });
      if (resource.status === "pending") throw resource.promise;

      const refetch = () => {
        const next: Resource = {
          status: "pending",
          names: [],
          promise: Promise.resolve(),
        };
        next.promise = new Promise((resolve) => {
          relay.resolve = (names) => {
            next.status = "done";
            next.names = names;
            resolve();
          };
        });
        setResource(next);
        return { dispose: () => undefined };
      };

      return [
        { savedViews: resource.names.map((name) => ({ name })) },
        refetch,
      ];
    },
  };
});

const SavedViews = ({
  refetchRef,
}: {
  refetchRef: { current: (() => void) | null };
}) => {
  const [data, refetch] = useRefetchableSavedViews();
  refetchRef.current = () => refetch({ name: "dataset" });
  return <div>{data.savedViews.map(({ name }) => name).join(",")}</div>;
};

describe("useRefetchableSavedViews", () => {
  afterEach(cleanup);

  it("keeps the current views on screen while a refetch is pending", async () => {
    const refetchRef: { current: (() => void) | null } = { current: null };
    render(
      <Suspense fallback={<div>fallback</div>}>
        <SavedViews refetchRef={refetchRef} />
      </Suspense>,
    );

    act(() => refetchRef.current?.());

    expect(screen.queryByText("fallback")).toBeNull();
    expect(screen.getByText("before")).toBeTruthy();

    await act(async () => relay.resolve(["after"]));

    expect(screen.getByText("after")).toBeTruthy();
  });
});
