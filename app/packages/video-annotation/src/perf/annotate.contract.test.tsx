/**
 * Copyright 2017-2026, Voxel51, Inc.
 *
 * Annotate counts contracts. The real stream, seed, frame store, engine,
 * temporal view and track hook run against a fake `/video-labels` fetch; the
 * suites assert operation counts per event, never timings. Known violations
 * are `test.fails` until fixed.
 *
 * Growth table: ANNOTATE_PERF_REPORT=1 yarn vitest run --no-coverage \
 *   packages/video-annotation/src/perf
 */

import { act, renderHook } from "@testing-library/react";
import { getDefaultStore } from "jotai";
import { AnnotationEngine, FrameTemporalView } from "@fiftyone/annotation";
import { LabelType, Sample } from "@fiftyone/utilities";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { type Counts, type Counters, installCounters } from "./counts";
import {
  CHUNK_SIZE,
  type ClipShape,
  createFakeClip,
  FIELD,
  framesOf,
  PATH,
} from "./fakeClip";

const h = vi.hoisted(() => ({
  clip: null as unknown as ReturnType<typeof createFakeClip>,
  counters: null as Counters | null,
  engine: null as unknown as AnnotationEngine,
  stream: null as unknown,
  getSample: null as unknown as () => unknown,
}));

// The fetch contract: the only behavior faked.
vi.mock("../../../core/src/client/videoLabelsClient", () => ({
  getVideoLabelsWindow: (request: { startFrame: number; endFrame: number }) => {
    h.counters?.fetched();
    return h.clip.window(request);
  },
  getVideoLabelsIndex: () => h.clip.index(),
}));

// Context accessors only: they hand the real engine and stream to the hooks.
vi.mock("@fiftyone/annotation", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@fiftyone/annotation")>()),
  useActiveSampleId: () => "sample-1",
  useAnnotationEngine: () => h.engine,
  // stable, as the real getter is: a fresh one per render re-registers the store
  useSampleInstanceGetter: () => h.getSample,
}));
vi.mock("@fiftyone/state", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@fiftyone/state")>()),
  useIsImageDynamicGroupVideo: () => false,
}));
vi.mock("../streams/frameLabelsStream", () => ({
  useFrameLabelsStream: () => h.stream,
}));
vi.mock("../state/accessors", () => ({
  useFrameLabelFields: () => LABEL_TYPES,
  useVisibleLabelSchemas: () => VISIBLE,
}));

import { useSyncAnnotationVideoStore } from "../hooks/useSyncAnnotationVideoStore";
import { VideoFrameLabelsStream } from "../streams/VideoFrameLabelsStream";
import { useFrameDerivedTracks } from "../tracks/useFrameDerivedTracks";
import { useReconcileLabels } from "../../../core/src/components/Modal/Sidebar/Annotate/useReconcileLabels";
import { labels as sidebarLabels } from "../../../core/src/components/Modal/Sidebar/Annotate/labelsAtoms";

const LABEL_TYPES = { [PATH]: LabelType.Detections } as Record<
  string,
  LabelType
>;
const VISIBLE = new Set([PATH]);
const SIDEBAR_PATHS = [PATH];
const NO_PATHS = new Set<string>();
const noDynamicAttributes = () => [];

/** Mirrors `VideoAnnotationHandlerRegistration` + `FrameLabelsTracks`. */
const useAnnotateSurface = (resolveColor: () => string) => {
  useSyncAnnotationVideoStore({
    labelTypes: LABEL_TYPES,
    sampleLevelPaths: NO_PATHS,
  });
  return useFrameDerivedTracks(resolveColor, noDynamicAttributes);
};

const flush = () =>
  act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });

let counters: Counters;

beforeEach(() => {
  const sample = new Sample({ data: {}, schema: {} });
  h.getSample = () => sample;
  h.clip = createFakeClip();
  counters = installCounters();
  h.counters = counters;
});

afterEach(() => {
  counters.restore();
  h.counters = null;
});

/**
 * Mount Annotate over `shape`, with a frame clock parked on frame 1. `sidebar`
 * also mounts the label list's reconcile, subscribed as `useLabels` does.
 */
const mountAnnotate = async (shape: ClipShape, { sidebar = false } = {}) => {
  h.clip.use(shape);
  h.engine = new AnnotationEngine();
  h.stream = new VideoFrameLabelsStream({
    id: "labels",
    sampleId: "sample-1",
    dataset: "d",
    view: [],
    frameCount: framesOf(shape),
    frameRate: 30,
    frameField: FIELD,
  });

  let frame = 1;
  const clockListeners = new Set<(time: number) => void>();
  h.engine.attachTemporal(
    (engine) =>
      new FrameTemporalView(
        engine,
        {
          getTime: () => frame,
          subscribe: (listener) => {
            clockListeners.add(listener);
            return () => clockListeners.delete(listener);
          },
        },
        (time) => time,
      ),
  );

  let rendered: { current: { tracks: { id: string }[] } } | null = null;
  const mount = await counters.event(async () => {
    rendered = renderHook(() =>
      useAnnotateSurface(() => (counters.built(), "#fff")),
    ).result;

    if (sidebar) {
      const reconcile = renderHook(() =>
        useReconcileLabels({
          engine: h.engine,
          scene: null,
          active: SIDEBAR_PATHS,
          sampleId: "sample-1",
        }),
      ).result.current;
      // subscribed as `useLabels` does: engine ticks and playhead frames
      reconcile();
      h.engine.subscribe(reconcile);
      h.engine.subscribeFrame(reconcile);
    }

    await flush();
  });

  return {
    mount,
    trackIds: () => (rendered?.current.tracks ?? []).map(({ id }) => id),
    /** Settle one open window request: one chunk-landed event. */
    land: () =>
      counters.event(async () => {
        h.clip.settleOldest();
        await flush();
      }),
    /** Land every chunk, returning each landing's counts. */
    landAll: async () => {
      const landings: Counts[] = [];

      while (h.clip.inFlight > 0) {
        landings.push(
          await counters.event(async () => {
            h.clip.settleOldest();
            await flush();
          }),
        );
      }

      return landings;
    },
    /** Advance the playhead one frame: one playhead-tick event. */
    tick: () =>
      counters.event(() => {
        frame++;
        clockListeners.forEach((listener) => listener(frame));
      }),
    /** Scrub the playhead to `to`: one playhead-tick event. */
    seek: (to: number) =>
      counters.event(() => {
        frame = to;
        clockListeners.forEach((listener) => listener(frame));
      }),
    /** Move one box on the playhead's frame: one edit-committed event. */
    edit: () =>
      counters.event(() => {
        h.engine.updateLabel(
          {
            sample: "sample-1",
            path: PATH,
            instanceId: shape.linked ? "inst-0" : `d-${frame}-0`,
            frame,
          },
          { bounding_box: [0.5, 0.5, 0.1, 0.1] },
        );
      }),
  };
};

const max = (landings: Counts[], op: keyof Counts) =>
  Math.max(...landings.map((counts) => counts[op]));

const LINKED: ClipShape = { chunks: 10, labelsPerFrame: 11, linked: true };
const UNLINKED: ClipShape = { chunks: 10, labelsPerFrame: 11, linked: false };

describe("Annotate seed", () => {
  test("mounting dispatches at most 3 window requests, the warmup's share of the budget", async () => {
    const { mount } = await mountAnnotate(LINKED);

    expect(mount.fetch).toBe(3);
  });

  test("the paced seed still loads every chunk exactly once", async () => {
    const { landAll } = await mountAnnotate(LINKED);
    const landings = await landAll();

    expect(landings).toHaveLength(LINKED.chunks);
    expect(h.clip.requests).toBe(LINKED.chunks);
    expect(h.clip.maxInFlight).toBe(3);
  });

  test("a chunk landing parses only its own frames", async () => {
    const { landAll } = await mountAnnotate(LINKED);

    expect(max(await landAll(), "parse")).toBe(CHUNK_SIZE);
  });

  test("a chunk landing compares only its own frames", async () => {
    const { landAll } = await mountAnnotate(LINKED);

    // new frames have no prior source to compare against
    expect(max(await landAll(), "compare")).toBe(0);
  });
});

describe("Annotate track rebuild", () => {
  test("a chunk landing with no edits reads no frames for the track rebuild", async () => {
    const { landAll } = await mountAnnotate(LINKED);

    expect(max(await landAll(), "read")).toBe(0);
  });

  test("a chunk landing with no edits builds and serializes no tracks", async () => {
    const { landAll } = await mountAnnotate(UNLINKED);
    const landings = await landAll();

    expect(max(landings, "build")).toBe(0);
    expect(max(landings, "serialize")).toBe(0);
  });

  test("an edit committed reads only its own frame for the track rebuild", async () => {
    const { landAll, edit } = await mountAnnotate(LINKED);
    await landAll();

    expect(await edit()).toMatchObject({
      read: 1,
      build: LINKED.labelsPerFrame,
    });
  });

  test("a deleted box's row leaves the timeline and stays gone after a save", async () => {
    const { landAll, trackIds } = await mountAnnotate(UNLINKED);
    await landAll();
    const gone = {
      sample: "sample-1",
      path: PATH,
      instanceId: "d-7-3",
      frame: 7,
    };
    expect(trackIds()).toContain("d-7-3");

    await act(async () => h.engine.deleteLabel(gone));
    expect(trackIds()).not.toContain("d-7-3");
    expect(trackIds()).toHaveLength(framesOf(UNLINKED) * 11 - 1);

    // a save folds the delete into the seed and clears the dirty set
    await act(async () =>
      h.engine.reconcilePersisted([
        {
          sample: "sample-1",
          deltas: h.engine.getJsonPatch()[0].deltas,
        },
      ]),
    );
    expect(h.engine.isDirty()).toBe(false);
    expect(trackIds()).not.toContain("d-7-3");
  });
});

describe("Annotate playhead", () => {
  test("a playhead tick enumerates only the current frame's labels", async () => {
    const { landAll, tick } = await mountAnnotate(LINKED);
    await landAll();

    expect((await tick()).enumerate).toBe(LINKED.labelsPerFrame);
  });
});

describe.runIf(process.env.ANNOTATE_PERF_REPORT)("growth report", () => {
  test.each([10, 50, 210])(
    "%i chunks, linked, 11 labels per frame",
    async (chunks) => {
      const labelsPerFrame = 11;
      const shape = { chunks, labelsPerFrame, linked: true };
      const { mount, landAll, tick, edit } = await mountAnnotate(shape, {
        sidebar: true,
      });
      const landings = await landAll();
      const sum = (op: keyof Counts) =>
        landings.reduce((total, counts) => total + counts[op], 0);

      console.log(
        JSON.stringify({
          chunks,
          labelsPerFrame,
          frames: framesOf(shape),
          mountFetch: mount.fetch,
          maxInFlight: h.clip.maxInFlight,
          landing: {
            last: landings[landings.length - 1],
            total: {
              parse: sum("parse"),
              compare: sum("compare"),
              read: sum("read"),
              build: sum("build"),
              serialize: sum("serialize"),
              enumerate: sum("enumerate"),
              list: sum("list"),
              stringify: sum("stringify"),
            },
          },
          tick: await tick(),
          edit: await edit(),
        }),
      );
    },
    600_000,
  );
});

describe("Annotate sidebar label list", () => {
  test("a chunk landing serializes no already-held labels", async () => {
    const { landAll } = await mountAnnotate(LINKED, { sidebar: true });

    expect(max(await landAll(), "stringify")).toBe(0);
  });

  // the temporal view's presence refresh plus the sidebar's own read, each
  // one frame's labels
  const FRAME_BUDGET = 2 * LINKED.labelsPerFrame;

  test("a chunk landing lists no labels clip-wide and reads only the playhead's frame", async () => {
    const { landAll } = await mountAnnotate(LINKED, { sidebar: true });
    const landings = await landAll();

    expect(max(landings, "list")).toBe(0);
    // the first landing also settles the store's loading flag: one more
    // display tick, one more frame's read
    expect(landings[0].enumerate).toBe(FRAME_BUDGET + LINKED.labelsPerFrame);
    expect(max(landings.slice(1), "enumerate")).toBe(FRAME_BUDGET);
  });

  test("a playhead tick re-derives the list from the new frame only", async () => {
    const { landAll, tick } = await mountAnnotate(LINKED, { sidebar: true });
    await landAll();

    expect(await tick()).toMatchObject({ list: 0, enumerate: FRAME_BUDGET });
  });

  test("an edit committed re-derives the list from the playhead's frame only", async () => {
    const { landAll, edit } = await mountAnnotate(LINKED, { sidebar: true });
    await landAll();

    expect(await edit()).toMatchObject({ list: 0, enumerate: FRAME_BUDGET });
  });

  const rowIds = () =>
    getDefaultStore()
      .get(sidebarLabels)
      .map((row) => row.data._id)
      .sort();
  const frameIds = (frame: number) =>
    Array.from(
      { length: UNLINKED.labelsPerFrame },
      (_, slot) => `d-${frame}-${slot}`,
    ).sort();

  test("scrubbing shows exactly the new frame's labels", async () => {
    const { landAll, seek } = await mountAnnotate(UNLINKED, { sidebar: true });
    await landAll();
    expect(rowIds()).toEqual(frameIds(1));

    await seek(250);
    expect(rowIds()).toEqual(frameIds(250));

    await seek(3);
    expect(rowIds()).toEqual(frameIds(3));
  });

  test("a new box appears at once; a deleted box stays gone after a save", async () => {
    const { landAll, seek } = await mountAnnotate(UNLINKED, { sidebar: true });
    await landAll();
    await seek(40);

    const created = h.engine
      .scope("sample-1")
      .createLabel(
        PATH,
        { label: "person", bounding_box: [0, 0, 0.2, 0.2] },
        40,
      );
    const createdId = h.engine.getLabel(created)?._id as string;
    expect(rowIds()).toEqual([...frameIds(40), createdId].sort());

    h.engine.deleteLabel({
      sample: "sample-1",
      path: PATH,
      instanceId: "d-40-3",
      frame: 40,
    });
    expect(rowIds()).not.toContain("d-40-3");

    h.engine.reconcilePersisted([
      { sample: "sample-1", deltas: h.engine.getJsonPatch()[0].deltas },
    ]);
    expect(h.engine.isDirty()).toBe(false);
    expect(rowIds()).not.toContain("d-40-3");

    await seek(41);
    await seek(40);
    expect(rowIds()).not.toContain("d-40-3");
    expect(rowIds()).toContain(createdId);
    expect(rowIds()).toHaveLength(UNLINKED.labelsPerFrame);
  });
});

describe("Annotate memory held", () => {
  const MASKED: ClipShape = { ...LINKED, maskChars: 256 };

  test("a seeded label is held as two objects that share one mask payload", async () => {
    const { landAll } = await mountAnnotate(MASKED);
    await landAll();

    const stream = h.stream as VideoFrameLabelsStream;
    const raw = (
      stream.cachedFrames().find((doc) => doc.frame_number === 1)?.[FIELD] as {
        detections: Array<{ mask: string; bounding_box: number[] }>;
      }
    ).detections[0];
    const held = h.engine.getLabel({
      sample: "sample-1",
      path: PATH,
      instanceId: "inst-0",
      frame: 1,
    }) as unknown as { mask: string; bounding_box: number[] };

    // the stream's raw document and the store's parsed copy are separate
    // objects; their payload values (mask string, box array) are one copy
    expect(held).not.toBe(raw);
    expect(held.mask).toBe(raw.mask);
    expect(held.bounding_box).toBe(raw.bounding_box);
  });

  test.fails(
    "after the seed the label stream holds at most its lookahead window",
    async () => {
      const { landAll } = await mountAnnotate(LINKED);
      await landAll();

      // 12s of lookahead at 30fps, plus the chunk the playhead sits in
      expect(
        (h.stream as VideoFrameLabelsStream).cachedFrames().length,
      ).toBeLessThanOrEqual(12 * 30 + CHUNK_SIZE);
    },
  );
});

const gc = (globalThis as { gc?: () => void }).gc;

describe.runIf(process.env.ANNOTATE_PERF_REPORT && gc)("heap report", () => {
  test.each([0, 3_000])(
    "50 chunks, 11 labels per frame, %i-char masks",
    async (maskChars) => {
      gc?.();
      const before = process.memoryUsage().heapUsed;
      const { landAll } = await mountAnnotate({
        chunks: 50,
        labelsPerFrame: 11,
        linked: true,
        maskChars,
      });
      await landAll();
      gc?.();
      const held = process.memoryUsage().heapUsed - before;
      const labels = 50 * CHUNK_SIZE * 11;

      console.log(
        JSON.stringify({
          maskChars,
          labels,
          heldMB: Math.round(held / 1e5) / 10,
          bytesPerLabel: Math.round(held / labels),
          streamFrames: (h.stream as VideoFrameLabelsStream).cachedFrames()
            .length,
        }),
      );
    },
    600_000,
  );
});
