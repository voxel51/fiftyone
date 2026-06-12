/**
 * Copyright 2017-2026, Voxel51, Inc.
 */

import type { Sample } from "@fiftyone/looker";

/**
 * The canonical client-side copy of every sample the user has touched this
 * session — the single shared cache all views derive from.
 *
 * Invariant: an entry always equals the last-known-server state with every
 * pending (unsaved) edit applied. It is written exclusively through
 * `useUpdateSamples`, read synchronously by the annotation persistence layer
 * (precondition baselines), and overlaid onto Relay responses by the
 * `modalSample` selector — so the modal, the grid tile, and the save pipeline
 * all see one copy of the data, never a stale render snapshot.
 */
const samples = new Map<string, Sample>();

/**
 * Sample ids whose canonical copy was last changed by something other than
 * the annotation editor itself (server conflict reconciliation, tagging,
 * etc.). The annotation scene consumes this to know when it must re-read
 * sample data — its own write-throughs never require a re-read, since the
 * scene is where those edits originated.
 */
const externallyChanged = new Set<string>();

export type SampleWriteSource = "editor" | "external";

export const getLocalSample = (id: string): Sample | undefined =>
  samples.get(id);

export const hasLocalSample = (id: string): boolean => samples.has(id);

/**
 * Populate the canonical copy from freshly fetched data iff no copy exists
 * yet. A no-op once any edit has written through — fetched data can never
 * clobber local edits.
 */
export const seedLocalSample = (id: string, sample: Sample): void => {
  if (!samples.has(id)) {
    samples.set(id, sample);
  }
};

export const setLocalSample = (
  id: string,
  sample: Sample,
  source: SampleWriteSource = "external"
): void => {
  samples.set(id, sample);
  if (source === "external") {
    externallyChanged.add(id);
  }
};

export const deleteLocalSample = (id: string): void => {
  samples.delete(id);
  externallyChanged.delete(id);
};

/**
 * Whether the sample changed from a non-editor source since the last call;
 * reading clears the flag. The annotation scene calls this to decide whether
 * a sample-data change requires re-reading labels into the scene.
 */
export const consumeExternalSampleChange = (id: string): boolean =>
  externallyChanged.delete(id);
