/**
 * Copyright 2017-2026, Voxel51, Inc.
 */

import {
  FetchFunctionConfig,
  FetchFunctionResult,
  getFetchFunctionExtended,
  MalformedRequestError,
  NotFoundError,
} from "@fiftyone/utilities";
import { toExtendedJson } from "./transformer";
import { encodeURIPath } from "./util";

/**
 * A single gated annotation field update. The server gates on `previousValue`
 * still holding and writes `newValue`: `previousValue: null` adds,
 * `newValue: null` removes, both present modifies the differing fields.
 */
export type AnnotationFieldUpdate = {
  /** Target collection (e.g. `samples.<datasetId>`); must belong to the route dataset. */
  collection: string;
  /** `_id` of the document to match. */
  id: string;
  /** Array path for a list label (`ground_truth.detections`), else the field itself. */
  lookupPath?: string;
  /** `_id` of the label within `lookupPath`; omit for a flat label/primitive. */
  labelId?: string | null;
  /** The value the editor started from (the precondition). */
  previousValue?: unknown;
  /** The value to write; `null` removes. */
  newValue?: unknown;
  /** Generated (patches/clips) dataset to sync; the server derives that write. */
  generatedDatasetName?: string;
  /** `_id` of the generated (patches) sample to sync. */
  generatedSampleId?: string;
};

export type ErrorResponse = { errors: string[] };

/** Raised on a malformed save request (HTTP 400). */
export class PatchApplicationError extends Error {
  constructor(message?: string) {
    super(message);
    this.name = "Patch Application Error";
  }
}

/** One conflicting update: its batch `index` and the document's current state. */
export type SaveConflict = {
  /** Index into the submitted batch. */
  index: number;
  /** Full current state of the conflicting document, or `null` if deleted. */
  value: unknown;
};

/**
 * Raised when one or more updates failed their precondition (HTTP 409). Each
 * conflict carries the document's full current state so the caller can rebase
 * without a refetch.
 */
export class SaveConflictError extends Error {
  constructor(readonly conflicts: SaveConflict[] = []) {
    super("Annotation save conflict");
    this.name = "Save Conflict Error";
  }
}

const errorHandlers: Record<number, (response: Response) => Promise<void>> = {
  // malformed request
  400: async (response) => {
    let errors: string[] | undefined;
    try {
      const parsed = JSON.parse(await response.text());
      if (Array.isArray(parsed)) {
        errors = parsed.map(String);
      } else if (parsed?.detail) {
        errors = [String(parsed.detail)];
      }
    } catch (err) {
      console.error("unparsable error:", err);
    }
    if (errors?.length) {
      console.error("Annotation save errors:", errors);
      throw new PatchApplicationError(errors.join(", "));
    }
    throw new MalformedRequestError(
      "Unexpected error response. See console for details."
    );
  },

  // document not found
  404: async () => {
    throw new NotFoundError({ path: "sample" });
  },

  // precondition mismatch — one or more updates conflicted
  409: async (response) => {
    let conflicts: SaveConflict[] = [];
    try {
      const body = await response.json();
      if (Array.isArray(body?.conflicts)) {
        conflicts = body.conflicts;
      }
    } catch (err) {
      console.warn("error parsing conflict response", err);
    }
    throw new SaveConflictError(conflicts);
  },
};

const doFetch = <A, R>(
  config: Omit<FetchFunctionConfig<A>, "errorHandler">
): Promise<FetchFunctionResult<R>> =>
  getFetchFunctionExtended()({
    errorHandler: (response) => errorHandlers[response.status]?.(response),
    ...config,
  });

/** Encode to Extended JSON so nested ObjectIds/datetimes reach the server as BSON. */
const encodeUpdate = (
  update: AnnotationFieldUpdate
): Record<string, unknown> => {
  const encoded: Record<string, unknown> = {
    collection: update.collection,
    id: update.id,
  };
  if (update.generatedDatasetName) {
    encoded.generatedDatasetName = update.generatedDatasetName;
  }
  if (update.generatedSampleId) {
    encoded.generatedSampleId = update.generatedSampleId;
  }
  if (update.lookupPath !== undefined) {
    encoded.lookupPath = update.lookupPath;
  }
  if (update.labelId !== undefined && update.labelId !== null) {
    encoded.labelId = update.labelId;
  }
  if ("previousValue" in update) {
    encoded.previousValue = toExtendedJson(update.previousValue);
  }
  if ("newValue" in update) {
    encoded.newValue = toExtendedJson(update.newValue);
  }
  return encoded;
};

/**
 * Persist a batch of gated annotation field updates in one request, each
 * applied independently. `datasetId`/`sampleId` are route context only.
 *
 * @throws SaveConflictError if any update's precondition failed (HTTP 409)
 */
export const saveAnnotationFieldUpdates = async (
  datasetId: string,
  sampleId: string,
  updates: AnnotationFieldUpdate[]
): Promise<void> => {
  if (updates.length === 0) {
    return;
  }

  await doFetch<Record<string, unknown>[], unknown>({
    path: encodeURIPath(["dataset", datasetId, "sample", sampleId, "fields"]),
    method: "PATCH",
    body: updates.map(encodeUpdate),
    headers: { "Content-Type": "application/json" },
  });
};
