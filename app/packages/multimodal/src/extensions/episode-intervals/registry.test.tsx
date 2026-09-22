import { renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import {
  registerEpisodeIntervalSource,
  sortSources,
  useEpisodeIntervalSources,
} from "./registry";
import type { EpisodeIntervalSource } from "./types";

const source = (id: string, order = 100): EpisodeIntervalSource => ({
  id,
  label: id,
  order,
  Component: () => null,
});

describe("registerEpisodeIntervalSource", () => {
  it("exposes a registered source to the hook", () => {
    const unregister = registerEpisodeIntervalSource(source("test:a"));
    try {
      const { result } = renderHook(() => useEpisodeIntervalSources());
      expect(result.current.map((s) => s.id)).toContain("test:a");
    } finally {
      unregister();
    }
  });

  it("withdraws the source on unregister", () => {
    registerEpisodeIntervalSource(source("test:b"))();

    const { result } = renderHook(() => useEpisodeIntervalSources());
    expect(result.current.map((s) => s.id)).not.toContain("test:b");
  });

  it("orders by order, then id, independent of registration order", () => {
    const un = [
      registerEpisodeIntervalSource(source("test:z", 100)),
      registerEpisodeIntervalSource(source("test:a", 300)),
      registerEpisodeIntervalSource(source("test:b", 100)),
    ];
    try {
      const { result } = renderHook(() => useEpisodeIntervalSources());
      const ids = result.current
        .filter((s) => s.id.startsWith("test:"))
        .map((s) => s.id);
      expect(ids).toEqual(["test:b", "test:z", "test:a"]);
    } finally {
      for (const u of un) u();
    }
  });

  it("rejects an id that is not namespaced", () => {
    // The id doubles as a timeline section id, and useTimelineSections throws on
    // a section id with no colon — catching it here names the real culprit.
    expect(() => registerEpisodeIntervalSource(source("nocolon"))).toThrow(
      /namespaced/,
    );
  });

  it("replaces a re-registered id rather than throwing", () => {
    // A module reload hands back a new component object for the same source;
    // rejecting it would leave the stale component mounted for the session.
    const first = source("test:reload");
    const second = { ...source("test:reload"), label: "second" };
    const un1 = registerEpisodeIntervalSource(first);
    const un2 = registerEpisodeIntervalSource(second);
    try {
      const { result } = renderHook(() => useEpisodeIntervalSources());
      const matches = result.current.filter((s) => s.id === "test:reload");
      expect(matches).toHaveLength(1);
      expect(matches[0].label).toBe("second");
    } finally {
      un1();
      un2();
    }
  });

  it("ignores a stale unregister after the id was re-registered", () => {
    const first = source("test:stale");
    const second = { ...source("test:stale"), label: "second" };
    const un1 = registerEpisodeIntervalSource(first);
    const un2 = registerEpisodeIntervalSource(second);
    try {
      // The first registration's disposer must not withdraw the entry that
      // replaced it.
      un1();
      const { result } = renderHook(() => useEpisodeIntervalSources());
      expect(result.current.filter((s) => s.id === "test:stale")).toHaveLength(
        1,
      );
    } finally {
      un2();
    }
  });

  it("returns a stable snapshot while nothing changes", () => {
    // useSyncExternalStore treats a fresh array as a change and would re-render
    // every subscriber on each read.
    const unregister = registerEpisodeIntervalSource(source("test:stable"));
    try {
      const { result, rerender } = renderHook(() =>
        useEpisodeIntervalSources(),
      );
      const first = result.current;
      rerender();
      expect(result.current).toBe(first);
    } finally {
      unregister();
    }
  });
});

describe("sortSources", () => {
  it("does not mutate its input", () => {
    const input = [source("test:b", 200), source("test:a", 100)];
    const copy = [...input];

    sortSources(input);

    expect(input).toEqual(copy);
  });
});
