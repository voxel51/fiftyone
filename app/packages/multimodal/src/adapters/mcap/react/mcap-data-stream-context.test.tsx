import { act, cleanup, render, screen } from "@testing-library/react";
import { useEffect } from "react";
import { afterEach, describe, expect, it } from "vitest";
import {
  McapDataStreamProvider,
  useMcapDataStream,
  useSetMcapDataStream,
  type McapDataStream,
} from "./mcap-data-stream-context";

afterEach(cleanup);

describe("McapDataStreamProvider", () => {
  it("hides an outgoing source synchronously without remounting consumers", () => {
    let publish: ReturnType<typeof useSetMcapDataStream> | null = null;
    let consumerMounts = 0;
    let consumerUnmounts = 0;

    const Publisher = () => {
      publish = useSetMcapDataStream();
      return null;
    };
    const Consumer = () => {
      const stream = useMcapDataStream();
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
      <McapDataStreamProvider expectedSourceKey={expectedSourceKey}>
        <Publisher />
        <Consumer />
      </McapDataStreamProvider>
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

function dataStream(sourceKey: string): McapDataStream {
  return {
    getTimelineIndex: () => null,
    getTopicCache: () => undefined,
    sourceKey,
    subscribeToTopic: () => () => undefined,
  };
}
