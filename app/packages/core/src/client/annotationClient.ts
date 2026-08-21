/**
 * Copyright 2017-2026, Voxel51, Inc.
 */

import { Sample } from "@fiftyone/looker";
import {
  FetchFunctionConfig,
  FetchFunctionResult,
  getFetchFunctionExtended,
  MalformedRequestError,
  NotFoundError,
} from "@fiftyone/utilities";
import * as jsonpatch from "fast-json-patch";
import { toExtendedJson } from "./transformer";
import { encodeURIPath, parseETag } from "./util";

/**
 * List of JSON-patch operation deltas between two versions of a json object.
 */
export type JSONDeltas = jsonpatch.Operation[];

export type PatchSampleRequest = {
  datasetId: string;
  sampleId: string;
  deltas: JSONDeltas;
  versionToken: string;
  path?: string;
  labelId?: string;
  generatedDatasetName?: string;
  generatedSampleId?: string;
};

export type ErrorResponse = {
  errors: string[];
};

/** One member's JSON-patch within a dynamic-group write. */
export type DynamicGroupMemberPatch = {
  sampleId: string;
  patch: JSONDeltas;
};

export type PatchDynamicGroupRequest = {
  datasetId: string;
  /** The dynamic group's key value (same shape `/frames` accepts). */
  dynamicGroup: string;
  /** Serialized view stages that define the grouping. */
  view: unknown[];
  patches: DynamicGroupMemberPatch[];
  /** The group version token — `"<max last_modified_at ISO>|<count>"`. */
  versionToken: string;
};

export type PatchDynamicGroupResponse = {
  samples: Sample[];
  versionToken: string;
};

/**
 * The fresh group state a dynamic-group 412 carries: the ordered members'
 * ids and `last_modified_at` values (position i ↔ frame i+1).
 */
export type DynamicGroupMismatchBody = {
  members: { id: string; last_modified_at: string }[];
};

export type PatchSampleResponse = {
  sample: Sample;
  versionToken: string;
};

/**
 * Error resulting from a failed update operation.
 */
export class PatchApplicationError extends Error {
  constructor(message?: string) {
    super(message);
    this.name = "Patch Application Error";
  }
}

/**
 * Error resulting from a version mismatch.
 *
 * When attempting to patch a sample, the server validates the provided version
 * token and rejects the update if there is a version mismatch.
 *
 * The updated sample data is provided in the response body, and a current
 * version token is provided in the ETag header.
 */
export class VersionMismatchError extends Error {
  constructor(
    message?: string,
    readonly responseBody?: Record<string, unknown>,
    readonly versionToken?: string,
  ) {
    super(message);
    this.name = "Version Mismatch Error";
  }
}

/**
 * Mapping of response code => error handler.
 *
 * These handlers are intended to be specific to known domain errors for the
 * annotation endpoints. For all other response codes, default error handling
 * is sufficient.
 */
const errorHandlers: Record<number, (response: Response) => Promise<void>> = {
  // bad request
  400: async (response) => {
    // either a malformed request, or a list of errors from applying the patch
    let errorResponse: ErrorResponse | undefined;
    try {
      // expected error response: '["error 1","error 2"]'
      const body = await response.text();
      const errorList = JSON.parse(body);
      if (Array.isArray(errorList)) {
        errorResponse = { errors: errorList };
      }
    } catch (err) {
      // doesn't look like a list of errors
      console.error("unparsable error:", err);
    }
    if (errorResponse?.errors) {
      console.error("Patch application errors:", errorResponse.errors);
      throw new PatchApplicationError(errorResponse.errors.join(", "));
    }

    throw new MalformedRequestError(
      "Unexpected error response. See console for details.",
    );
  },

  // sample not found
  404: async () => {
    throw new NotFoundError({ path: "sample" });
  },

  // version token mismatch
  412: async (response) => {
    let responseBody: Record<string, unknown>;
    try {
      responseBody = await response.json();
    } catch (err) {
      // JSON parsing error
      console.warn("error parsing response body", err);
    }

    throw new VersionMismatchError(
      "Invalid version token",
      responseBody,
      parseETag(response.headers.get("ETag")),
    );
  },
};

/**
 * `fetch` with headers, error handling, etc.
 *
 * @param config fetch configuration
 */
const doFetch = <A, R>(
  config: Omit<FetchFunctionConfig<A>, "errorHandler">,
): Promise<FetchFunctionResult<R>> => {
  return getFetchFunctionExtended()({
    errorHandler: (response) => errorHandlers[response.status]?.(response),
    ...config,
  });
};

/**
 * Patch a sample, applying the specified updates to its fields.
 *
 * @param request Patch sample request
 */
export const patchSample = async (
  request: PatchSampleRequest,
): Promise<PatchSampleResponse> => {
  // Build the base path for the request.
  const pathParts = ["dataset", request.datasetId, "sample", request.sampleId];

  // Use the sampleField endpoint for field-level updates (eg detection in patchesView)
  if (request.path && request.labelId) {
    pathParts.push(request.path, request.labelId);
  }

  // Add generated dataset and label ids as query parameter if present
  // This enables syncing changes from the source to the currently loaded generated dataset.
  // We do this instead of making a separate request with the generated dataset _id
  // because we want to ensure permissions are checked against the src dataset.
  const queryParams = new URLSearchParams();
  if (request.generatedDatasetName) {
    if (
      !request.generatedSampleId ||
      request.generatedSampleId === request.sampleId
    ) {
      throw new Error(
        "generatedSampleId is required and must be different from sampleId when generatedDatasetName is provided",
      );
    }
    queryParams.set("generated_dataset", request.generatedDatasetName);
    queryParams.set("generated_sample_id", request.generatedSampleId);
  }

  const queryString = queryParams.toString();
  const pathWithQuery = queryString
    ? `${encodeURIPath(pathParts)}?${queryString}`
    : encodeURIPath(pathParts);

  const deltas = request.deltas.map((delta) =>
    "value" in delta ? { ...delta, value: toExtendedJson(delta.value) } : delta,
  );

  const response = await doFetch<JSONDeltas, Sample>({
    path: pathWithQuery,
    method: "PATCH",
    body: deltas,
    headers: {
      "Content-Type": "application/json-patch+json",
      "If-Match": `"${request.versionToken}"`,
    },
  });

  return {
    sample: response.response,
    versionToken: parseETag(response.headers.get("ETag")),
  };
};

/**
 * Patch members of a dynamic group under a single group version token.
 *
 * The group — not each member — is the concurrency container: the server
 * validates the token against the group's current state (max
 * `last_modified_at` over the members plus the member count) and applies the
 * per-member patches, so the write carries video's single-ETag semantics
 * onto a group of samples. A stale token throws {@link VersionMismatchError}
 * whose `responseBody` is a {@link DynamicGroupMismatchBody} and whose
 * `versionToken` is fresh.
 *
 * @param request Patch dynamic group request
 */
export const patchDynamicGroup = async (
  request: PatchDynamicGroupRequest,
): Promise<PatchDynamicGroupResponse> => {
  const patches = request.patches.map(({ sampleId, patch }) => ({
    sampleId,
    patch: patch.map((delta) =>
      "value" in delta
        ? { ...delta, value: toExtendedJson(delta.value) }
        : delta,
    ),
  }));

  const response = await doFetch<
    { dynamicGroup: string; view: unknown[]; patches: typeof patches },
    { samples: Sample[] }
  >({
    path: encodeURIPath(["dataset", request.datasetId, "dynamic-group"]),
    method: "PATCH",
    body: {
      dynamicGroup: request.dynamicGroup,
      view: request.view,
      patches,
    },
    headers: {
      "Content-Type": "application/json",
      "If-Match": `"${request.versionToken}"`,
    },
  });

  return {
    samples: response.response.samples,
    versionToken: parseETag(response.headers.get("ETag")),
  };
};
