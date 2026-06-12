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
 * A single gated annotation field update.
 *
 * The server matches the document (and, for a label in a list field, the
 * element) by identity, gates on the fields that changed still holding
 * `previousValue`, and writes `newValue`:
 *
 *   - `previousValue: null` → add a new label
 *   - `newValue: null`      → remove the label (unset / pull)
 *   - both present          → modify the fields that differ
 *
 * `op: "deleteDocument"` removes the whole document (e.g. a patches sample
 * whose label was deleted) and ignores the value/path fields.
 *
 * Every save — sidebar or canvas, normal or patches — is one or more of these.
 */
export type AnnotationFieldUpdate = {
  /** Target Mongo collection, e.g. `samples.<datasetId>`. */
  collection?: string;
  /**
   * Generated (patches) dataset name; the backend resolves it to the patches
   * collection. Provide this instead of `collection` when the FE only has the
   * dataset name (not its `_id`).
   */
  datasetName?: string;
  /** `_id` of the document to match. */
  id: string;
  /**
   * Path to the field. For a label inside a list field this is the array path
   * (e.g. `ground_truth.detections`); for a flat label or a primitive it is
   * the field itself.
   */
  lookupPath?: string;
  /** `_id` of the label within `lookupPath`; omit for a flat label/primitive. */
  labelId?: string | null;
  /** The value the editor started from (the precondition). */
  previousValue?: unknown;
  /** The value to write; `null` removes. */
  newValue?: unknown;
  /** `"deleteDocument"` deletes the whole document. */
  op?: "update" | "deleteDocument";
};

export type ErrorResponse = { errors: string[] };

/** Raised on a malformed save request (HTTP 400). */
export class PatchApplicationError extends Error {
  constructor(message?: string) {
    super(message);
    this.name = "Patch Application Error";
  }
}

/** One conflicting update: its batch `index` and the field's current value. */
export type SaveConflict = {
  /** Index into the submitted batch. */
  index: number;
  /** Current value of the touched top-level field (extended JSON). */
  value: unknown;
};

/**
 * Raised when one or more updates failed their precondition (HTTP 409).
 *
 * Each conflict carries the current value of the touched top-level field so
 * the caller can reconcile just that field (no full-sample refetch needed).
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

/**
 * Encode an update to MongoDB Extended JSON so nested ObjectIds/datetimes in
 * the label values round-trip to the server as their BSON types.
 */
const encodeUpdate = (
  update: AnnotationFieldUpdate
): Record<string, unknown> => {
  const encoded: Record<string, unknown> = { id: update.id };
  if (update.collection) {
    encoded.collection = update.collection;
  }
  if (update.datasetName) {
    encoded.datasetName = update.datasetName;
  }
  if (update.op) {
    encoded.op = update.op;
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
 * Persist a batch of gated annotation field updates in a single request.
 *
 * Each update is applied atomically and independently on its named collection.
 * A patches edit is a single call whose batch carries both the source-label
 * update and the patches-sample update.
 *
 * @param datasetId contextual dataset id (route only — each update names its
 *   own target collection)
 * @param sampleId contextual sample id (route only)
 * @param updates the gated updates to apply
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
