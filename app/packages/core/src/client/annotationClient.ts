import { encodeURIPath } from "./util";
import { Sample } from "@fiftyone/looker";
import {
  MalformedRequestError,
  NetworkError,
  NotFoundError,
} from "@fiftyone/utilities";

/**
 * Label types which currently support mutation via {@link patchSample}.
 */
export type MutableLabelTypes =
  | "Classification"
  | "Classifications"
  | "Detection"
  | "Detections"
  | "Polyline"
  | "Polylines";

/**
 * Specification for a field which should be removed.
 */
export type NullField = null;

/**
 * Specification for a label field.
 */
export type LabelField = {
  _cls: MutableLabelTypes;
  [key: string]: unknown;
};

/**
 * Specification for a top-level attribute field.
 */
export type AttributeField = Record<string, unknown>;

/**
 * A field specification can either be
 *  - `null` indicating the field should be deleted, OR
 *  - an object containing at least the `_cls` field to specify the label type, OR
 *  - an arbitrary mapping to primitives or objects
 */
export type FieldSpecification = NullField | LabelField | AttributeField;

export type PatchSampleRequest = {
  datasetId: string;
  sampleId: string;
  delta: Record<string, FieldSpecification>;
};

export type ErrorResponse = {
  errors: string[];
};

export type PatchSampleResponse = ErrorResponse | Sample;

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
    let body: ErrorResponse;
    try {
      body = await response.json();
    } catch (err) {
      body = {} as ErrorResponse;
    }
    if (body.errors) {
      throw new PatchApplicationError(body.errors.join(", "));
    }

    throw new MalformedRequestError();
  } else if (response.status === 404) {
    throw new NotFoundError({ path: "sample" });
  }

  throw new Error(`http error: ${response.status} ${response.statusText}`);
};

/**
 * Patch a sample, applying the specified updates to its fields.
 *
 * @param request Patch sample request
 */
export const patchSample = async (
  request: PatchSampleRequest
): Promise<PatchSampleResponse> => {
  const httpResponse = await fetch(
    encodeURIPath(["dataset", request.datasetId, "sample", request.sampleId]),
    {
      method: "PATCH",
      body: JSON.stringify(request.delta),
      headers: {
        "content-type": "application/json",
      },
    }
  );

  if (httpResponse.ok) {
    return httpResponse.json();
  } else {
    await handleErrorResponse(httpResponse);
  }
};
