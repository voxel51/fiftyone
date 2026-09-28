/**
 * Copyright 2017-2026, Voxel51, Inc.
 *
 * Shared fixtures for the persist-ordering tests: a minimal engine whose
 * pending deltas behave like the real one's (persisted entries reconcile
 * away, a rolled-back entry restores), and server sample bodies at known
 * versions.
 */

import type { JSONDeltas } from "@fiftyone/core/src/client";
import type { Sample } from "@fiftyone/looker";
import { vi } from "vitest";

export const SAMPLE_ID = "66e4b1c2f0a1b2c3d4e5f601";

export const T0 = new Date("2026-09-14T22:19:00.000Z");
export const T1 = new Date("2026-09-14T22:19:04.250Z");
export const T2 = new Date("2026-09-14T22:19:09.500Z");

/** The token derived from the loaded sample's own `last_modified_at`. */
export const T0_TOKEN = "2026-09-14T22:19:00.000";

/** A sample body as the server returns it (Mongo extended JSON dates). */
export const serverSample = (lastModifiedAt: Date) => ({
  _id: SAMPLE_ID,
  _media_type: "image",
  filepath: "/tmp/image.png",
  last_modified_at: { $date: lastModifiedAt.toISOString() },
});

/**
 * The sample as the modal loaded it, at T0. Tests hand this same object to
 * every render so the token closure never observes a refresh — the
 * pessimistic case the record has to cover.
 */
export const LOADED_SAMPLE = {
  _id: SAMPLE_ID,
  _media_type: "image",
  filepath: "/tmp/image.png",
  last_modified_at: { datetime: T0.getTime() },
} as unknown as Sample;

type Delta = JSONDeltas[number];
type UndoEntry = { deltas: Delta[] };

export const makeEngine = () => {
  const pending: Delta[] = [];
  let undoTop: UndoEntry | undefined;
  let collecting: Delta[] | null = null;

  const discard = (delta: Delta) => {
    const index = pending.indexOf(delta);

    if (index >= 0) {
      pending.splice(index, 1);
    }
  };

  const engine = {
    pending,
    /** Stage an edit, as a form/canvas commit would. */
    stage: (delta: Delta) => {
      pending.push(delta);
    },
    discard,
    getVersion: () => 0,
    // no store here owns its own transport, so every patch takes the default
    getPersistenceAdapter: () => undefined,
    captureBaseline: vi.fn(),
    getJsonPatch: vi.fn(() =>
      pending.length ? [{ sample: SAMPLE_ID, deltas: [...pending] }] : [],
    ),
    reconcilePersisted: vi.fn(
      (entries: { sample: string; deltas: JSONDeltas }[]) => {
        for (const entry of entries) {
          for (const delta of entry.deltas) {
            discard(delta);
          }
        }
      },
    ),
    // delete hooks
    deleteLabel: vi.fn(
      (ref: { path: string; instanceId: string; frame?: number }) => {
        const frame = ref.frame == null ? "" : `/frames/${ref.frame}`;
        const delta = {
          op: "remove",
          path: `${frame}/${ref.path.replace(/\./g, "/")}/${ref.instanceId}`,
        } as Delta;

        pending.push(delta);

        if (collecting) {
          collecting.push(delta);
        } else {
          undoTop = { deltas: [delta] };
        }
      },
    ),
    transaction: vi.fn((fn: () => void) => {
      collecting = [];
      fn();
      undoTop = { deltas: collecting };
      collecting = null;
    }),
    lastUndoEntry: vi.fn(() => undoTop),
    /** Restoring a delete drops its pending remove ops. */
    rollbackEntry: vi.fn((entry: UndoEntry) => {
      for (const delta of entry.deltas) {
        discard(delta);
      }
    }),
    loadedFrames: () => [1, 2, 3],
    getLabel: () => ({}),
  };

  return engine;
};

export type TestEngine = ReturnType<typeof makeEngine>;

export const deferred = <T>() => {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });

  return { promise, resolve, reject };
};

/** Drain microtasks so queued persists have a chance to start. */
export const flush = () => new Promise((resolve) => setTimeout(resolve, 0));
