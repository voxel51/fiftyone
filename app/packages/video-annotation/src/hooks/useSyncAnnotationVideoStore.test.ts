/**
 * Copyright 2017-2026, Voxel51, Inc.
 *
 * The frame store is born loading. What settles it: cached data at seed time,
 * or the first landing — never only the whole-clip warmup, which the
 * read-only surface opts out of.
 */

import { act, renderHook } from "@testing-library/react";
import { Sample } from "@fiftyone/utilities";
import { beforeEach, describe, expect, it, vi } from "vitest";

interface FakeStream {
  cachedFrames: () => { frame_number: number }[];
  subscribeToEdits: (listener: () => void) => () => void;
  warmupAll: () => Promise<void>;
  listener: (() => void) | null;
}

const hoisted = vi.hoisted(() => ({
  registered: [] as { isLoading: () => boolean }[],
  stream: null as FakeStream | null,
}));

vi.mock("@fiftyone/annotation", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@fiftyone/annotation")>();
  return {
    ...actual,
    useActiveSampleId: () => "sample-1",
    useAnnotationEngine: () => ({
      registerStore: (store: { isLoading: () => boolean }) => {
        hoisted.registered.push(store);
        return () => undefined;
      },
    }),
    useEngineSelector: () => null,
    useSampleInstanceGetter: () => () => new Sample({ data: {}, schema: {} }),
  };
});
vi.mock("../streams/frameLabelsStream", () => ({
  useFrameLabelsStream: () => hoisted.stream,
}));
vi.mock("../state/accessors", () => ({
  useFrameLabelFields: () => ({}),
  useVisibleLabelSchemas: () => new Set<string>(),
}));

import { useSyncAnnotationVideoStore } from "./useSyncAnnotationVideoStore";

const makeStream = (cached: { frame_number: number }[]): FakeStream => {
  const stream: FakeStream = {
    cachedFrames: () => cached,
    subscribeToEdits: (listener) => {
      stream.listener = listener;
      return () => {
        stream.listener = null;
      };
    },
    // Never resolves: settling must not depend on the warmup
    warmupAll: () => new Promise(() => undefined),
    listener: null,
  };
  return stream;
};

describe("useSyncAnnotationVideoStore loading state", () => {
  beforeEach(() => {
    hoisted.registered.length = 0;
  });

  it("settles at once when the stream already holds frames", () => {
    hoisted.stream = makeStream([{ frame_number: 1 }, { frame_number: 2 }]);

    renderHook(() =>
      useSyncAnnotationVideoStore({
        labelTypes: {},
        sampleLevelPaths: new Set<string>(),
        seedWholeClip: false,
      }),
    );

    expect(hoisted.registered).toHaveLength(1);
    expect(hoisted.registered[0].isLoading()).toBe(false);
  });

  it("an empty cache stays loading until the first landing", () => {
    hoisted.stream = makeStream([]);

    renderHook(() =>
      useSyncAnnotationVideoStore({
        labelTypes: {},
        sampleLevelPaths: new Set<string>(),
        seedWholeClip: false,
      }),
    );

    expect(hoisted.registered[0].isLoading()).toBe(true);

    act(() => hoisted.stream?.listener?.());
    expect(hoisted.registered[0].isLoading()).toBe(false);
  });
});
