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

const handleErrorResponse = async (response: Response) => {
  if (response.status === 400) {
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
      "Unexpected error response. See console for details."
    );
  } else if (response.status === 404) {
    throw new NotFoundError({ path: "sample" });
  }
};

/**
 * `fetch` with headers, error handling, etc.
 *
 * @param config fetch configuration
 */
const doFetch = <A, R>(
  config: FetchFunctionConfig<A>
): Promise<FetchFunctionResult<R>> => {
  return getFetchFunctionExtended()({
    errorHandler: handleErrorResponse,
    ...config,
  });
};

/**
 * Patch a sample, applying the specified updates to its fields.
 *
 * @param request Patch sample request
 */
export const patchSample = async (
  request: PatchSampleRequest
): Promise<PatchSampleResponse> => {
  // Build the base path for the request.
  const pathParts = ["dataset", request.datasetId, "sample", request.sampleId];

  // Use the sampleField endpoint for field-level updates (eg detection in patchesView)
  if (request.path && request.labelId) {
    pathParts.push(request.path, request.labelId);
  }

  // Add generated dataset and label ids as query parameter if present
  // This enables syncing changes from the source to the currently loaded generated dataset.
  // We do this instead of making a separate request with the generated dataset _id because we want to
  // ensure permissions are checked against the src dataset.
  const queryParams = new URLSearchParams();
  if (request.generatedDatasetName) {
    queryParams.set("generated_dataset", request.generatedDatasetName);
  }
  if (request.generatedSampleId) {
    queryParams.set("generated_sample_id", request.generatedSampleId);
  }

  const queryString = queryParams.toString();
  const pathWithQuery = queryString
    ? `${encodeURIPath(pathParts)}?${queryString}`
    : encodeURIPath(pathParts);

  const response = await doFetch<JSONDeltas, Sample>({
    path: pathWithQuery,
    method: "PATCH",
    body: request.deltas,
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
