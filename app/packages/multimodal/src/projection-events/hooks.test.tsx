import type { SampleRendererProps } from "@fiftyone/plugins";
import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import { useEffect } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  useEpisodeProjectionEvents,
  useSampleRendererProjectionEvents,
} from "./hooks";
import type {
  ProjectionEvent,
  ProjectionEventsClient,
  UseEpisodeProjectionEventsOptions,
  UseEpisodeProjectionEventsResult,
} from "./types";

afterEach(() => {
  cleanup();
});

describe("useEpisodeProjectionEvents", () => {
  it("stays idle without an episode scope", () => {
    const client = createClient();

    render(
      <Harness
        options={{ client, datasetId: "dataset-id", episodeId: undefined }}
      />,
    );

    expect(screen.getByTestId("events").textContent).toBe("idle::");
    expect(client.listEpisodeProjectionEvents).not.toHaveBeenCalled();
  });

  it("loads episode projection events", async () => {
    const client = createClient({
      listEpisodeProjectionEvents: vi.fn(async () => [
        makeEvent("pedestrian_fast"),
      ]),
    });

    render(
      <Harness
        options={{ client, datasetId: "dataset-id", episodeId: "episode-id" }}
      />,
    );

    await waitFor(() => {
      expect(screen.getByTestId("events").textContent).toBe(
        "ready:pedestrian_fast:",
      );
    });
    expect(client.listEpisodeProjectionEvents).toHaveBeenCalledWith({
      datasetId: "dataset-id",
      episodeId: "episode-id",
      filter: undefined,
    });
  });

  it("refetches when the episode id or filter changes", async () => {
    const client = createClient({
      listEpisodeProjectionEvents: vi.fn(async ({ episodeId, filter }) => [
        makeEvent(`${episodeId}-${filter?.startNs ?? 0n}`),
      ]),
    });

    const { rerender } = render(
      <Harness
        options={{
          client,
          datasetId: "dataset-id",
          episodeId: "episode-a",
          filter: { startNs: 1n },
        }}
      />,
    );

    await waitFor(() => {
      expect(screen.getByTestId("events").textContent).toBe(
        "ready:episode-a-1:",
      );
    });

    rerender(
      <Harness
        options={{
          client,
          datasetId: "dataset-id",
          episodeId: "episode-b",
          filter: { startNs: 2n },
        }}
      />,
    );

    await waitFor(() => {
      expect(screen.getByTestId("events").textContent).toBe(
        "ready:episode-b-2:",
      );
    });
    expect(client.listEpisodeProjectionEvents).toHaveBeenCalledTimes(2);
  });

  it("ignores stale async responses after a rerender", async () => {
    const first = deferred<readonly ProjectionEvent[]>();
    const second = deferred<readonly ProjectionEvent[]>();
    const client = createClient({
      listEpisodeProjectionEvents: vi.fn(({ episodeId }) =>
        episodeId === "episode-a" ? first.promise : second.promise,
      ),
    });

    const { rerender } = render(
      <Harness
        options={{ client, datasetId: "dataset-id", episodeId: "episode-a" }}
      />,
    );

    await waitFor(() => {
      expect(client.listEpisodeProjectionEvents).toHaveBeenCalledTimes(1);
    });

    rerender(
      <Harness
        options={{ client, datasetId: "dataset-id", episodeId: "episode-b" }}
      />,
    );

    await waitFor(() => {
      expect(client.listEpisodeProjectionEvents).toHaveBeenCalledTimes(2);
    });

    await act(async () => {
      second.resolve([makeEvent("episode-b")]);
      await second.promise;
    });
    expect(screen.getByTestId("events").textContent).toBe("ready:episode-b:");

    // The late first response for episode-a must not clobber episode-b.
    await act(async () => {
      first.resolve([makeEvent("episode-a")]);
      await first.promise;
    });
    expect(screen.getByTestId("events").textContent).toBe("ready:episode-b:");
  });

  it("surfaces client errors", async () => {
    const client = createClient({
      listEpisodeProjectionEvents: vi.fn(async () => {
        throw new Error("boom");
      }),
    });

    render(
      <Harness
        options={{ client, datasetId: "dataset-id", episodeId: "episode-id" }}
      />,
    );

    await waitFor(() => {
      expect(screen.getByTestId("events").textContent).toBe("error::boom");
    });
  });
});

describe("useSampleRendererProjectionEvents", () => {
  it("derives the episode scope from a sample renderer context", async () => {
    const client = createClient();
    const ctx = {
      dataset: { datasetId: "dataset-id" },
      sample: { sample: { _id: "sample-id" } },
    } as SampleRendererProps["ctx"];

    render(<SampleRendererHarness client={client} ctx={ctx} />);

    await waitFor(() => {
      expect(client.listEpisodeProjectionEvents).toHaveBeenCalledWith({
        datasetId: "dataset-id",
        episodeId: "sample-id",
        filter: undefined,
      });
    });
  });
});

function Harness({
  onState,
  options,
}: {
  readonly onState?: (state: UseEpisodeProjectionEventsResult) => void;
  readonly options: UseEpisodeProjectionEventsOptions;
}) {
  const state = useEpisodeProjectionEvents(options);

  useEffect(() => {
    onState?.(state);
  }, [onState, state]);

  return (
    <div data-testid="events">
      {state.status}:{state.events.map((e) => e.id).join(",")}:
      {state.error ?? ""}
    </div>
  );
}

function SampleRendererHarness({
  client,
  ctx,
}: {
  readonly client: ProjectionEventsClient;
  readonly ctx: SampleRendererProps["ctx"];
}) {
  useSampleRendererProjectionEvents(ctx, { client });

  return null;
}

function createClient(
  overrides: Partial<ProjectionEventsClient> = {},
): ProjectionEventsClient {
  return {
    listEpisodeProjectionEvents: vi.fn(async () => []),
    ...overrides,
  };
}

function makeEvent(id: string): ProjectionEvent {
  return {
    id,
    name: id,
    startTimestampNs: 1_000_000_000n,
    endTimestampNs: 2_000_000_000n,
    episodeId: "episode-id",
  };
}

function deferred<Value>() {
  let resolve!: (value: Value) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<Value>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });

  return { promise, reject, resolve };
}
