import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { useEffect } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ByteSourceDescriptor } from "../../../query/bytes";
import type { StreamInventory } from "../../../schemas/v1";
import type { McapResourceClient } from "../types";
import { useMcapTopics, type McapTopicsState } from "./use-mcap-topics";

afterEach(() => {
  cleanup();
});

describe("useMcapTopics", () => {
  it("stays idle for a null source", () => {
    const client = createTopicsClient();

    render(<TopicsHarness client={client} label="topics" source={null} />);

    expect(screen.getByTestId("topics").textContent).toBe("idle:0:");
    expect(client.readTopics).not.toHaveBeenCalled();
  });

  it("loads topics for a valid source", async () => {
    const source = createSource("loads");
    const client = createTopicsClient(async () => [createTopic("camera")]);

    render(<TopicsHarness client={client} label="topics" source={source} />);

    await waitFor(() => {
      expect(screen.getByTestId("topics").textContent).toBe("ready:1:");
    });
    expect(client.readTopics).toHaveBeenCalledWith({ source });
  });

  it("dedupes in-flight and resolved reads for the same source", async () => {
    const source = createSource("dedupe");
    const pendingTopics = deferred<readonly StreamInventory[]>();
    const client = createTopicsClient(() => pendingTopics.promise);

    const { unmount } = render(
      <>
        <TopicsHarness client={client} label="first" source={source} />
        <TopicsHarness client={client} label="second" source={source} />
      </>
    );

    await waitFor(() => {
      expect(client.readTopics).toHaveBeenCalledTimes(1);
    });

    pendingTopics.resolve([createTopic("camera")]);

    await waitFor(() => {
      expect(screen.getByTestId("first").textContent).toBe("ready:1:");
      expect(screen.getByTestId("second").textContent).toBe("ready:1:");
    });
    unmount();

    const laterClient = createTopicsClient(async () => [createTopic("lidar")]);
    render(
      <TopicsHarness client={laterClient} label="cached" source={source} />
    );

    await waitFor(() => {
      expect(screen.getByTestId("cached").textContent).toBe("ready:1:");
    });
    expect(laterClient.readTopics).not.toHaveBeenCalled();
  });

  it("surfaces failed reads and retries the same source later", async () => {
    const source = createSource("retry");
    const failedClient = createTopicsClient(async () => {
      throw new Error("boom");
    });

    const { unmount } = render(
      <TopicsHarness client={failedClient} label="failed" source={source} />
    );

    await waitFor(() => {
      expect(screen.getByTestId("failed").textContent).toBe("error:0:boom");
    });
    unmount();

    const retryClient = createTopicsClient(async () => [createTopic("camera")]);
    render(
      <TopicsHarness client={retryClient} label="retry" source={source} />
    );

    await waitFor(() => {
      expect(screen.getByTestId("retry").textContent).toBe("ready:1:");
    });
    expect(retryClient.readTopics).toHaveBeenCalledTimes(1);
  });

  it("reads again when the source key changes", async () => {
    const firstSource = createSource("source-a");
    const secondSource = createSource("source-b");
    const client = createTopicsClient(async ({ source }) => [
      createTopic(source.sourceId),
    ]);

    const { rerender } = render(
      <TopicsHarness client={client} label="topics" source={firstSource} />
    );

    await waitFor(() => {
      expect(client.readTopics).toHaveBeenCalledTimes(1);
    });

    rerender(
      <TopicsHarness client={client} label="topics" source={secondSource} />
    );

    await waitFor(() => {
      expect(client.readTopics).toHaveBeenCalledTimes(2);
    });
    expect(client.readTopics).toHaveBeenLastCalledWith({
      source: secondSource,
    });
  });
});

function TopicsHarness({
  client,
  label,
  onState,
  source,
}: {
  readonly client: McapResourceClient;
  readonly label: string;
  readonly onState?: (state: McapTopicsState) => void;
  readonly source: ByteSourceDescriptor | null;
}) {
  const state = useMcapTopics({ client, source });

  useEffect(() => {
    onState?.(state);
  }, [onState, state]);

  return (
    <div data-testid={label}>
      {state.status}:{state.topics.length}:{state.error ?? ""}
    </div>
  );
}

function createTopicsClient(
  readTopics: McapResourceClient["readTopics"] = vi.fn(async () => [])
): McapResourceClient {
  return {
    dispose: vi.fn(),
    readDecodedMessages: vi.fn(async function* () {
      for (const item of [] as never[]) {
        yield item;
      }
    }),
    readSynchronizedMessageBatch: vi.fn(async () => []),
    readSynchronizedMessages: vi.fn(),
    readTimelineRange: vi.fn(),
    readTopics: vi.fn(readTopics),
  };
}

function createSource(id: string): ByteSourceDescriptor {
  return {
    sourceId: id,
    url: `memory://${id}.mcap`,
  };
}

function createTopic(streamId: string): StreamInventory {
  return {
    $typeName: "fiftyone.multimodal.schemas.v1.StreamInventory",
    metadata: {},
    streamId,
  };
}

function deferred<Value>() {
  let resolve!: (value: Value) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<Value>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });

  return {
    promise,
    reject,
    resolve,
  };
}
