import type { SampleRendererProps } from "@fiftyone/plugins";
import { render } from "@testing-library/react";
import React, { useMemo } from "react";
import { describe, expect, it, vi } from "vitest";
import { EpisodeIntervalSources } from "./chain";
import { registerEpisodeIntervalSource } from "./registry";
import type {
  EpisodeInterval,
  EpisodeIntervalContribution,
  EpisodeIntervalSource,
  EpisodeIntervalSourceProps,
  ResolvedEpisodeIntervals,
} from "./types";

const CTX = {
  dataset: { datasetId: "ds", name: "ds" },
  sample: { sample: { _id: "episode-1" } },
  media: {},
} as unknown as SampleRendererProps["ctx"];

const interval = (sourceId: string, eventName: string): EpisodeInterval => ({
  sourceId,
  eventName,
  color: "#000",
  startNs: 0,
  endNs: 1,
});

/** A source reporting a fixed, stable contribution. */
function fixedSource(
  id: string,
  names: string[],
  order = 100,
): EpisodeIntervalSource {
  const Component: React.FC<EpisodeIntervalSourceProps> = ({ children }) => {
    const contribution = useMemo<EpisodeIntervalContribution>(
      () => ({ intervals: names.map((name) => interval(id, name)) }),
      [],
    );
    return <>{children(contribution)}</>;
  };
  return { id, label: id, order, Component };
}

/** Renders the chain and hands each resolution to a spy. */
function renderChain(
  builtInSources: readonly EpisodeIntervalSource[] | undefined,
  onResolved: (resolved: readonly ResolvedEpisodeIntervals[]) => void,
) {
  return render(
    <EpisodeIntervalSources builtInSources={builtInSources} ctx={CTX}>
      {(resolved) => {
        onResolved(resolved);
        return null;
      }}
    </EpisodeIntervalSources>,
  );
}

describe("EpisodeIntervalSources", () => {
  it("resolves to nothing when no source exists", () => {
    const seen = vi.fn();
    renderChain(undefined, seen);

    expect(seen).toHaveBeenCalledWith([]);
  });

  it("collects a built-in source's contribution", () => {
    const seen = vi.fn();
    renderChain([fixedSource("built:in", ["a"])], seen);

    const resolved = seen.mock.calls.at(-1)?.[0] as ResolvedEpisodeIntervals[];
    expect(resolved).toHaveLength(1);
    expect(resolved[0].source.id).toBe("built:in");
    expect(resolved[0].contribution.intervals.map((i) => i.eventName)).toEqual([
      "a",
    ]);
  });

  it("collects built-in and registered sources together, in order", () => {
    const unregister = registerEpisodeIntervalSource(
      fixedSource("reg:late", ["r"], 300),
    );
    try {
      const seen = vi.fn();
      renderChain([fixedSource("built:early", ["b"], 100)], seen);

      const resolved = seen.mock.calls.at(
        -1,
      )?.[0] as ResolvedEpisodeIntervals[];
      expect(resolved.map((entry) => entry.source.id)).toEqual([
        "built:early",
        "reg:late",
      ]);
    } finally {
      unregister();
    }
  });

  it("orders by the sources' declared order, not by built-in first", () => {
    const unregister = registerEpisodeIntervalSource(
      fixedSource("reg:first", ["r"], 10),
    );
    try {
      const seen = vi.fn();
      renderChain([fixedSource("built:second", ["b"], 900)], seen);

      const resolved = seen.mock.calls.at(
        -1,
      )?.[0] as ResolvedEpisodeIntervals[];
      expect(resolved.map((entry) => entry.source.id)).toEqual([
        "reg:first",
        "built:second",
      ]);
    } finally {
      unregister();
    }
  });

  it("mounts every source rather than stopping at an empty one", () => {
    // A source that contributes nothing must not hide the ones after it; each
    // gates itself, so all of them have to run.
    const seen = vi.fn();
    renderChain(
      [
        fixedSource("built:empty", [], 100),
        fixedSource("built:full", ["x"], 200),
      ],
      seen,
    );

    const resolved = seen.mock.calls.at(-1)?.[0] as ResolvedEpisodeIntervals[];
    expect(resolved.map((entry) => entry.source.id)).toEqual([
      "built:empty",
      "built:full",
    ]);
    expect(resolved[0].contribution.intervals).toEqual([]);
  });

  it("passes the renderer context to each source", () => {
    const received: unknown[] = [];
    const Component: React.FC<EpisodeIntervalSourceProps> = ({
      ctx,
      children,
    }) => {
      received.push(ctx);
      return <>{children({ intervals: [] })}</>;
    };

    renderChain(
      [{ id: "built:ctx", label: "c", order: 1, Component }],
      vi.fn(),
    );

    expect(received[0]).toBe(CTX);
  });

  it("substitutes an empty contribution for a source reporting nothing", () => {
    // The contract allows a source to call children() with no value; the chain
    // must still produce a well-formed entry for it.
    const Component: React.FC<EpisodeIntervalSourceProps> = ({ children }) => (
      <>{children(undefined as unknown as EpisodeIntervalContribution)}</>
    );
    const seen = vi.fn();

    renderChain([{ id: "built:bare", label: "b", order: 1, Component }], seen);

    const resolved = seen.mock.calls.at(-1)?.[0] as ResolvedEpisodeIntervals[];
    expect(resolved[0].contribution.intervals).toEqual([]);
  });

  it("keeps the resolution list stable across re-renders", () => {
    // The modal derives tracks and pin ids from this list; a fresh array each
    // render would defeat every memo below it, including the whole shell.
    const SOURCES = [fixedSource("built:stable", ["a"])];
    const seen: (readonly ResolvedEpisodeIntervals[])[] = [];

    const Host = ({ tick }: { readonly tick: number }) => (
      <EpisodeIntervalSources builtInSources={SOURCES} ctx={CTX}>
        {(resolved) => {
          seen.push(resolved);
          return <span>{tick}</span>;
        }}
      </EpisodeIntervalSources>
    );

    const { rerender } = render(<Host tick={0} />);
    rerender(<Host tick={1} />);

    expect(seen.length).toBeGreaterThan(1);
    expect(seen.at(-1)).toBe(seen[0]);
  });
});
