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
    readonly versionToken?: string
  ) {
    super(message);
    this.name = "Version Mismatch Error";
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
    }
    if (errorResponse?.errors) {
      throw new PatchApplicationError(errorResponse.errors.join(", "));
    }

    throw new MalformedRequestError();
  } else if (response.status === 404) {
    throw new NotFoundError({ path: "sample" });
  } else if (response.status === 412) {
    throw new VersionMismatchError(
      "Invalid version token",
      await response.json(),
      parseETag(response.headers.get("ETag"))
    );
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
  const pathParts = ["dataset", request.datasetId, "sample", request.sampleId];
  if (request.path && request.labelId) {
    pathParts.push(request.path, request.labelId);
  }

  const response = await doFetch<JSONDeltas, Sample>({
    path: encodeURIPath(pathParts),
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
