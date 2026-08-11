import { act, cleanup, render, screen } from "@testing-library/react";
import { useEffect } from "react";
import { afterEach, describe, expect, it } from "vitest";
import {
  DataStreamProvider,
  useDataStream,
  useSetDataStream,
  type DataStream,
} from "./data-stream-context";

afterEach(cleanup);

describe("DataStreamProvider", () => {
  it("hides an outgoing source synchronously without remounting consumers", () => {
    let publish: ReturnType<typeof useSetDataStream> | null = null;
    let consumerMounts = 0;
    let consumerUnmounts = 0;

    const Publisher = () => {
      publish = useSetDataStream();
      return null;
    };
    const Consumer = () => {
      const stream = useDataStream();

      // This effect records whether context updates remount the consumer.
      useEffect(() => {
        consumerMounts += 1;
        return () => {
          consumerUnmounts += 1;
        };
      }, []);
      return (
        <span data-testid="source-key">{stream?.sourceKey ?? "none"}</span>
      );
    };
    const view = (expectedSourceKey: string | null) => (
      <DataStreamProvider expectedSourceKey={expectedSourceKey}>
        <Publisher />
        <Consumer />
      </DataStreamProvider>
    );

    const { rerender } = render(view("source-a"));
    act(() => publish?.(dataStream("source-a")));
    expect(screen.getByTestId("source-key").textContent).toBe("source-a");

    rerender(view(null));
    expect(screen.getByTestId("source-key").textContent).toBe("none");

    rerender(view("source-b"));
    expect(screen.getByTestId("source-key").textContent).toBe("none");
    act(() => publish?.(dataStream("source-b")));
    expect(screen.getByTestId("source-key").textContent).toBe("source-b");
    expect(consumerMounts).toBe(1);
    expect(consumerUnmounts).toBe(0);
  });
});

function dataStream(sourceKey: string): DataStream {
  return {
    getTimelineIndex: () => null,
    getStreamCache: () => undefined,
    sourceKey,
    subscribeToStream: () => () => undefined,
  };
}
